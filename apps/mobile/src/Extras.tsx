import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { berlinDate, brand, notificationText, shortDate, t, type Language, type ProfileRow, type TextKey } from "@gp/shared";
import { addDaysIso, errorText, loadMessages, loadMyAbsences, markAllRead, requestAbsence, type Message, type MyAbsence } from "./data";
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

/** Urlaub beantragen, krank melden und die eigenen Abwesenheiten sehen. */
export function Absences({ lang, profile, notify }: { lang: Language; profile: ProfileRow; notify: (key: TextKey) => void }) {
  const today = berlinDate();
  const [list, setList] = useState<MyAbsence[] | null>(null);
  const [kind, setKind] = useState<MyAbsence["kind"] | null>(null);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => loadMyAbsences(profile.id).then(setList).catch(() => setList([])), [profile.id]);
  useEffect(() => {
    load();
  }, [load]);

  const start = (k: MyAbsence["kind"]) => {
    setKind(k);
    setError(null);
    const first = k === "krank" ? today : addDaysIso(today, 1);
    setFrom(first);
    setTo(first);
  };

  const send = async () => {
    if (!kind) return;
    setBusy(true);
    setError(null);
    try {
      await requestAbsence(profile, kind, from, to, note);
      feel.success();
      notify(kind === "krank" ? "sickSent" : "vacationSent");
      setKind(null);
      setNote("");
      await load();
    } catch (e) {
      setError(t(lang, errorText(e as { message?: string })));
    }
    setBusy(false);
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
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.row}>
            <Button label={t(lang, "cancel")} onPress={() => setKind(null)} style={{ flex: 1 }} />
            <Button label={t(lang, "send")} variant="primary" busy={busy} onPress={send} style={{ flex: 1 }} />
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
          </View>
          <Text style={[styles.pill, { marginTop: 0, color: statusColor(a), backgroundColor: c.soft }]}>{statusText(a)}</Text>
        </View>
      ))}
    </View>
  );
}

function DateStepper({ lang, label, value, min, onChange }: { lang: Language; label: string; value: string; min: string; onChange: (d: string) => void }) {
  const step = (days: number) => {
    const next = addDaysIso(value, days);
    if (next < min) return;
    feel.tap();
    onChange(next);
  };
  return (
    <View style={[styles.buttonRow, { justifyContent: "space-between" }]}>
      <Text style={[styles.muted, { width: 48 }]}>{label}</Text>
      <Pressable onPress={() => step(-1)} style={styles.stepper} accessibilityRole="button" accessibilityLabel="-1" disabled={value <= min}>
        <Ionicons name="chevron-back" size={22} color={value <= min ? c.line : c.primary} />
      </Pressable>
      <Text style={[styles.jobName, { flex: 1, textAlign: "center" }]}>{shortDate(lang, value)}</Text>
      <Pressable onPress={() => step(1)} style={styles.stepper} accessibilityRole="button" accessibilityLabel="+1">
        <Ionicons name="chevron-forward" size={22} color={c.primary} />
      </Pressable>
    </View>
  );
}
