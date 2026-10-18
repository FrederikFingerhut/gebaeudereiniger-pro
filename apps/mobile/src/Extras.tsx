import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { berlinDate, brand, notificationText, shortDate, t, type Language, type ProfileRow, type TextKey } from "@gp/shared";
import { addDaysIso, errorText, loadMessages, loadMyAbsences, markAllRead, preparePhoto, requestAbsence, type Message, type MyAbsence, type ReportPhoto } from "./data";
import { enablePush, pushState, type PushState } from "./push";
import { Button, feel } from "./ui";
import { styles } from "./styles";

const c = brand.colors;
const locales: Record<Language, string> = { de: "de-DE", en: "en-GB", ru: "ru-RU", uk: "uk-UA" };

/** Nachrichten vom Büro (neue oder verschobene Einsätze, Antworten auf Urlaub). */
export function Messages({ lang, profile, onRead }: { lang: Language; profile: ProfileRow; onRead: () => void }) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await loadMessages(profile.id);
      setMessages(list);
      setFailed(false);
      if (list.some((m) => !m.read_at)) {
        await markAllRead(profile.id);
        onRead();
      }
    } catch {
      setFailed(true);
    }
  }, [profile.id, onRead]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView
      contentContainerStyle={styles.body}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <PushSwitch lang={lang} />
      <Text style={styles.label}>{t(lang, "notifications")}</Text>
      {!messages && !failed && <ActivityIndicator color={c.primary} />}
      {failed && !messages && <Text style={styles.muted}>{t(lang, "offline")}</Text>}
      {messages?.length === 0 && <Text style={styles.muted}>{t(lang, "noNotifications")}</Text>}
      {messages?.map((m) => {
        const text = notificationText(lang, m.kind, m.params);
        return (
          <View key={m.id} style={[styles.card, !m.read_at && { borderLeftWidth: 4, borderLeftColor: c.signal }]}>
            <Text style={styles.jobName}>{text.title}</Text>
            <Text style={{ color: c.text, fontSize: 15 }}>{text.body}</Text>
            <Text style={styles.muted}>{new Date(m.created_at).toLocaleString(locales[lang], { dateStyle: "short", timeStyle: "short" })}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

/** Knopf zum Einschalten der Benachrichtigungen aufs Handy. */
export function PushSwitch({ lang }: { lang: Language }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pushState().then(setState).catch(() => setState("unsupported"));
  }, []);

  if (!state) return null;
  if (state === "on")
    return (
      <View style={[styles.card, styles.buttonRow]}>
        <Ionicons name="notifications" size={22} color={c.ok} />
        <Text style={[styles.muted, { flex: 1 }]}>{t(lang, "pushEnabled")}</Text>
      </View>
    );
  if (state === "unsupported" || state === "denied")
    return (
      <View style={[styles.card, styles.buttonRow]}>
        <Ionicons name="notifications-off-outline" size={22} color={c.muted} />
        <Text style={[styles.muted, { flex: 1 }]}>{t(lang, state === "denied" ? "pushDenied" : "pushUnsupported")}</Text>
      </View>
    );
  return (
    <View style={{ gap: 6 }}>
      <Button
        label={t(lang, "pushOn")}
        icon="notifications-outline"
        variant="signal"
        busy={busy}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            setState(await enablePush());
            feel.success();
          } catch {
            setError(t(lang, "networkError"));
          }
          setBusy(false);
        }}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

/** Höchstens so viele Fotos der Krankmeldung (wie in der Datenbank). */
const MAX_SICK_PHOTOS = 3;

/** Urlaub beantragen, krank melden und die eigenen Abwesenheiten sehen. */
export function Absences({ lang, profile, notify }: { lang: Language; profile: ProfileRow; notify: (key: TextKey) => void }) {
  const today = berlinDate();
  const [list, setList] = useState<MyAbsence[] | null>(null);
  const [kind, setKind] = useState<MyAbsence["kind"] | null>(null);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => loadMyAbsences(profile.id).then(setList).catch(() => setList([])), [profile.id]);
  useEffect(() => {
    load();
  }, [load]);

  const start = (k: MyAbsence["kind"]) => {
    setKind(k);
    setError(null);
    setPhotos([]);
    setDenied(false);
    const first = k === "krank" ? today : addDaysIso(today, 1);
    setFrom(first);
    setTo(first);
  };

  const send = async () => {
    if (!kind) return;
    setBusy(true);
    setError(null);
    try {
      await requestAbsence(profile, kind, from, to, note, kind === "krank" ? photos.map((p) => p.base64) : []);
      feel.success();
      notify(kind === "krank" ? "sickSent" : "vacationSent");
      setKind(null);
      setNote("");
      setPhotos([]);
      await load();
    } catch (e) {
      setError(t(lang, errorText(e as { message?: string })));
    }
    setBusy(false);
  };

  // Foto der Krankmeldung (AU): Kamera oder Galerie, gleich verkleinert.
  const addPhoto = async (source: "camera" | "library") => {
    const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setDenied(true);
    setDenied(false);
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.8 };
    const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    setPreparing(true);
    try {
      const ready = await Promise.all(result.assets.map((a) => preparePhoto(a.uri, a.width)));
      setPhotos((prev) => [...prev, ...ready].slice(0, MAX_SICK_PHOTOS));
    } finally {
      setPreparing(false);
    }
  };

  const statusText = (a: MyAbsence) => (a.approved === true ? t(lang, "approved") : a.approved === false ? t(lang, "rejected") : t(lang, "waiting"));
  const statusColor = (a: MyAbsence) => (a.approved === true ? c.ok : a.approved === false ? c.bad : c.warn);

  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{t(lang, "absences")}</Text>
      {!kind && (
        <View style={styles.row}>
          <Button label={t(lang, "reportSick")} icon="medkit-outline" onPress={() => start("krank")} style={{ flex: 1 }} />
          <Button label={t(lang, "requestVacation")} icon="sunny-outline" onPress={() => start("urlaub")} style={{ flex: 1 }} />
        </View>
      )}
      {kind && (
        <View style={styles.card}>
          <Text style={styles.jobName}>{kind === "krank" ? t(lang, "reportSick") : t(lang, "requestVacation")}</Text>
          <DateStepper lang={lang} label={t(lang, "from")} value={from} min={today} onChange={(d) => { setFrom(d); if (to < d) setTo(d); }} />
          <DateStepper lang={lang} label={t(lang, "until")} value={to} min={from} onChange={setTo} />
          <TextInput style={styles.field} value={note} onChangeText={setNote} placeholder={t(lang, "noteOptional")} placeholderTextColor={c.muted} />
          {kind === "krank" && (
            <>
              <Text style={styles.muted}>{t(lang, "sickPhotoHint")}</Text>
              {(photos.length > 0 || preparing) && (
                <View style={styles.row}>
                  {photos.map((p, i) => (
                    <View key={p.uri}>
                      <Image source={{ uri: p.uri }} style={styles.thumb} />
                      <Pressable style={styles.thumbRemove} onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))} accessibilityLabel="✕" hitSlop={8}>
                        <Ionicons name="close" size={16} color={c.surface} />
                      </Pressable>
                    </View>
                  ))}
                  {preparing && <ActivityIndicator style={styles.thumb} color={c.primary} />}
                </View>
              )}
              {photos.length < MAX_SICK_PHOTOS && (
                <View style={styles.row}>
                  <Button label={t(lang, "takePhoto")} icon="camera-outline" style={{ flex: 1 }} onPress={() => addPhoto("camera")} />
                  <Button label={t(lang, "pickPhoto")} icon="images-outline" style={{ flex: 1 }} onPress={() => addPhoto("library")} />
                </View>
              )}
              {denied && <Text style={styles.error}>{t(lang, "photoDenied")}</Text>}
            </>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.row}>
            <Button label={t(lang, "cancel")} onPress={() => setKind(null)} style={{ flex: 1 }} />
            <Button label={t(lang, "send")} variant="primary" busy={busy} disabled={preparing} onPress={send} style={{ flex: 1 }} />
          </View>
        </View>
      )}
      {list?.map((a) => (
        <View key={a.id} style={[styles.card, styles.buttonRow, { justifyContent: "space-between" }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.jobName}>{a.kind === "krank" ? t(lang, "sick") : t(lang, "vacation")}</Text>
            <Text style={styles.muted}>
              {shortDate(lang, a.date_from)}
              {a.date_to !== a.date_from ? ` – ${shortDate(lang, a.date_to)}` : ""}
            </Text>
            {a.attachment_paths?.length > 0 && <Text style={styles.muted}>{t(lang, "sickPhotos").replace("{count}", String(a.attachment_paths.length))}</Text>}
          </View>
          <Text style={[styles.pill, { marginTop: 0, color: statusColor(a), backgroundColor: c.soft }]}>{statusText(a)}</Text>
        </View>
      ))}
    </View>
  );
}

export function DateStepper({ lang, label, value, min, max, onChange }: { lang: Language; label: string; value: string; min: string; max?: string; onChange: (d: string) => void }) {
  const step = (days: number) => {
    const next = addDaysIso(value, days);
    if (next < min || (max && next > max)) return;
    feel.tap();
    onChange(next);
  };
  const atMax = !!max && value >= max;
  return (
    <View style={[styles.buttonRow, { justifyContent: "space-between" }]}>
      <Text style={[styles.muted, { width: 64 }]}>{label}</Text>
      <Pressable onPress={() => step(-1)} style={styles.stepper} accessibilityRole="button" accessibilityLabel="-1" disabled={value <= min}>
        <Ionicons name="chevron-back" size={22} color={value <= min ? c.line : c.primary} />
      </Pressable>
      <Text style={[styles.jobName, { flex: 1, textAlign: "center" }]}>{shortDate(lang, value)}</Text>
      <Pressable onPress={() => step(1)} style={styles.stepper} accessibilityRole="button" accessibilityLabel="+1" disabled={atMax}>
        <Ionicons name="chevron-forward" size={22} color={atMax ? c.line : c.primary} />
      </Pressable>
    </View>
  );
}

/** Uhrzeit "HH:MM" in Schritten von 15 Minuten wählen. */
export function TimeStepper({ label, value, onChange }: { label: string; value: string; onChange: (time: string) => void }) {
  const [h, m] = value.split(":").map(Number);
  const minutes = (h || 0) * 60 + (m || 0);
  const step = (delta: number) => {
    // Auf das 15-Minuten-Raster runden, dann innerhalb des Tages bleiben.
    const next = (Math.round(minutes / 15) * 15 + delta + 1440) % 1440;
    feel.tap();
    onChange(`${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`);
  };
  return (
    <View style={[styles.buttonRow, { justifyContent: "space-between" }]}>
      <Text style={[styles.muted, { width: 64 }]}>{label}</Text>
      <Pressable onPress={() => step(-15)} onLongPress={() => step(-60)} style={styles.stepper} accessibilityRole="button" accessibilityLabel="-15">
        <Ionicons name="remove" size={22} color={c.primary} />
      </Pressable>
      <Text style={[styles.jobName, { flex: 1, textAlign: "center" }]}>{value}</Text>
      <Pressable onPress={() => step(15)} onLongPress={() => step(60)} style={styles.stepper} accessibilityRole="button" accessibilityLabel="+15">
        <Ionicons name="add" size={22} color={c.primary} />
      </Pressable>
    </View>
  );
}
