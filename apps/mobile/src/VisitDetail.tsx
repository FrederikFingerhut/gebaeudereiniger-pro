import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { brand, checklistTitle, t, type Language, type TextKey } from "@gp/shared";
import { errorText, preparePhoto, tokenFromQr, type Day, type MyVisit, type ReportKind, type ReportPhoto } from "./data";
import type { Action } from "./outbox";
import { Button, feel } from "./ui";
import { styles } from "./styles";

const c = brand.colors;

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

interface Props {
  lang: Language;
  visit: MyVisit;
  day: Day;
  act: (action: Action) => Promise<"done" | "queued">;
  onBack: () => void;
  onFinished: () => void;
  notify: (key: TextKey) => void;
}

export function VisitDetail({ lang, visit, day, act, onBack, onFinished, notify }: Props) {
  const entry = day.openEntry?.visit_id === visit.id ? day.openEntry : null;
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TextKey | null>(null);
  const [scanning, setScanning] = useState(false);
  const [reporting, setReporting] = useState(false);
  const checked = new Set(day.checked[visit.id] ?? []);
  const items = day.checklist.filter((i) => i.site_id === visit.siteId);
  const done = visit.status === "erledigt";

  useEffect(() => {
    if (!entry) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [entry]);

  /** Führt die Aktion aus; ohne Netz wird sie gespeichert und später gesendet. */
  const run = async (action: () => Promise<Action>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await act(await action());
      if (result === "queued") notify("savedOffline");
      return true;
    } catch (e) {
      feel.warn();
      setError(errorText(e as { message?: string }));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const at = () => new Date().toISOString();

  // Einstempeln per GPS: Standort holen, die Datenbank prüft den Abstand zum Objekt.
  // GPS funktioniert auch ohne Netz; die Prüfung passiert dann beim Nachsenden.
  const clockInGps = () =>
    run(async () => {
      const time = at();
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw { message: "standort_fehlt" };
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return { type: "clockIn", visitId: visit.id, place: { latitude: pos.coords.latitude, longitude: pos.coords.longitude }, at: time };
    }).then((ok) => ok && feel.success());

  const clockInQr = (data: string) => {
    setScanning(false);
    run(async () => ({ type: "clockIn", visitId: visit.id, place: { token: tokenFromQr(data) }, at: at() })).then((ok) => ok && feel.success());
  };

  const finish = async () => {
    if (await run(async () => ({ type: "clockOut", visitId: visit.id, at: at() }))) onFinished();
  };

  const toggle = (itemId: string) => {
    const on = !checked.has(itemId);
    if (on && checked.size + 1 === items.length) feel.success();
    act({ type: "check", visitId: visit.id, itemId, on }).catch(() => notify("networkError"));
  };

  if (scanning) return <QrScanner lang={lang} onScan={clockInQr} onCancel={() => setScanning(false)} />;

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack} accessibilityRole="button" style={styles.back} hitSlop={12}>
        <Ionicons name="chevron-back" size={20} color={c.primary} />
        <Text style={styles.backText}>{t(lang, "back")}</Text>
      </Pressable>
      <View>
        <Text style={styles.title}>{visit.site.name}</Text>
        <Text style={styles.muted}>
          {visit.startTime} · {visit.site.address}
        </Text>
      </View>

      {done ? (
        <View style={[styles.clock, { flexDirection: "row", justifyContent: "center" }]}>
          <Ionicons name="checkmark-circle" size={28} color={c.ok} />
          <Text style={[styles.jobName, { color: c.ok }]}>{t(lang, "done")}</Text>
        </View>
      ) : (
        <View style={styles.clock}>
          {entry && (
            <>
              <Text style={styles.label}>{t(lang, "runningFor")}</Text>
              <Text style={styles.clockTime}>{formatDuration(now - new Date(entry.clock_in_at).getTime())}</Text>
            </>
          )}
          {entry ? (
            <Button label={t(lang, "clockOut")} icon="stop-circle-outline" variant="primary" big busy={busy} onPress={finish} />
          ) : (
            <>
              <Button label={busy ? t(lang, "locating") : t(lang, "clockIn")} icon="location-outline" variant="signal" big busy={busy} onPress={clockInGps} />
              {busy && <Text style={styles.muted}>{t(lang, "locating")}</Text>}
              {!busy && <Button label={t(lang, "scanQr")} icon="qr-code-outline" big onPress={() => setScanning(true)} />}
            </>
          )}
          {error && <Text style={[styles.error, { textAlign: "center" }]}>{t(lang, error)}</Text>}
        </View>
      )}

      {items.length > 0 && (
        <>
          <Text style={styles.label}>
            {t(lang, "checklist")} · {checked.size}/{items.length}
          </Text>
          <View style={styles.progress}>
            <View style={[styles.progressBar, { width: `${(checked.size / items.length) * 100}%` }]} />
          </View>
        </>
      )}
      {items.map((item) => {
        const on = checked.has(item.id);
        return (
          <Pressable
            key={item.id}
            style={({ pressed }) => [styles.check, pressed && { transform: [{ scale: 0.98 }] }]}
            onPress={() => {
              feel.tap();
              toggle(item.id);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
          >
            <View style={[styles.box, on && styles.boxOn]}>{on && <Ionicons name="checkmark" size={20} color={c.onPrimary} />}</View>
            <Text style={[styles.checkText, on && styles.checkTextOn]}>{checklistTitle(item.title, lang)}</Text>
          </Pressable>
        );
      })}

      {reporting ? (
        <ReportForm
          lang={lang}
          onCancel={() => setReporting(false)}
          onSend={async (kind, text, photos) => {
            try {
              const result = await act({ type: "report", visitId: visit.id, siteId: visit.siteId, kind, text, photos: photos.map((p) => p.base64), at: at() });
              setReporting(false);
              feel.success();
              notify(result === "queued" ? "savedOffline" : "reportSent");
            } catch {
              notify("networkError");
            }
          }}
        />
      ) : (
        <Button label={t(lang, "reportProblem")} icon="chatbubble-ellipses-outline" onPress={() => setReporting(true)} />
      )}

      {(visit.site.accessNotes || visit.site.contact || visit.site.specialNotes) && (
        <>
          <Text style={styles.label}>{t(lang, "siteInfo")}</Text>
          <View style={[styles.card, styles.info]}>
            {visit.site.accessNotes && <InfoRow label={t(lang, "access")} value={visit.site.accessNotes} />}
            {visit.site.contact && <InfoRow label={t(lang, "contact")} value={visit.site.contact} />}
            {visit.site.specialNotes && <InfoRow label={t(lang, "special")} value={visit.site.specialNotes} />}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const MAX_PHOTOS = 3;

// Meldung ans Büro: Art, kurzer Text und bis zu drei Fotos.
function ReportForm({ lang, onSend, onCancel }: { lang: Language; onSend: (kind: ReportKind, text: string, photos: ReportPhoto[]) => Promise<void>; onCancel: () => void }) {
  const [kind, setKind] = useState<ReportKind>("problem");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);
  const [sending, setSending] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [denied, setDenied] = useState(false);

  const addPhoto = async (source: "camera" | "library") => {
    const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setDenied(true);
    setDenied(false);
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.8 };
    const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    // Gleich verkleinern: so passt das Foto auch offline in den Speicher.
    setPreparing(true);
    try {
      const ready = await Promise.all(result.assets.map((a) => preparePhoto(a.uri, a.width)));
      setPhotos((prev) => [...prev, ...ready].slice(0, MAX_PHOTOS));
    } finally {
      setPreparing(false);
    }
  };

  const send = async () => {
    setSending(true);
    await onSend(kind, text.trim(), photos);
    setSending(false);
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {(["problem", "material"] as const).map((k) => (
          <Pressable
            key={k}
            style={[styles.chip, kind === k && styles.chipOn]}
            onPress={() => {
              feel.tap();
              setKind(k);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: kind === k }}
          >
            <Text style={styles.chipText}>{t(lang, k === "problem" ? "kindProblem" : "kindMaterial")}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput style={styles.input} multiline placeholder={t(lang, "problemPlaceholder")} value={text} onChangeText={setText} />
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
      {photos.length < MAX_PHOTOS && (
        <View style={styles.row}>
          <Button label={t(lang, "takePhoto")} icon="camera-outline" style={{ flex: 1 }} onPress={() => addPhoto("camera")} />
          <Button label={t(lang, "pickPhoto")} icon="images-outline" style={{ flex: 1 }} onPress={() => addPhoto("library")} />
        </View>
      )}
      {denied && <Text style={styles.error}>{t(lang, "photoDenied")}</Text>}
      <Button
        label={t(lang, sending ? "sending" : "send")}
        variant="primary"
        icon="send"
        busy={sending}
        disabled={preparing || (!text.trim() && photos.length === 0)}
        onPress={send}
      />
      <Button label={t(lang, "cancel")} onPress={onCancel} />
    </View>
  );
}

function QrScanner({ lang, onScan, onCancel }: { lang: Language; onScan: (data: string) => void; onCancel: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [handled, setHandled] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  return (
    <View style={styles.scanner}>
      {permission?.granted && (
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={
            handled
              ? undefined
              : (result) => {
                  setHandled(true);
                  feel.tap();
                  onScan(result.data);
                }
          }
        />
      )}
      <View style={styles.scannerBar}>
        <Text style={styles.scannerHint}>{permission && !permission.granted && !permission.canAskAgain ? t(lang, "cameraDenied") : t(lang, "scanHint")}</Text>
        <Button label={t(lang, "cancel")} onPress={onCancel} />
      </View>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      <Text style={[styles.muted, { width: 110 }]}>{label}</Text>
      <Text style={{ flex: 1, color: c.text }}>{value}</Text>
    </View>
  );
}
