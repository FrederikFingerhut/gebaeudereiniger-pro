import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { brand, languages, t, type Language, type Visit } from "@gp/shared";
import { checklist, me, myVisits, siteById } from "./src/demo";

const c = brand.colors;

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

export default function App() {
  const [lang, setLang] = useState<Language>("uk");
  const [visits, setVisits] = useState<Visit[]>(myVisits);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  const finish = (index: number) => {
    setVisits((prev) => prev.map((v, i) => (i === index ? { ...v, status: "erledigt" } : v)));
    setOpenIndex(null);
    setNotice(t(lang, "clockedOut"));
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <View style={styles.langs}>
            {languages.map((l) => (
              <Pressable key={l.code} onPress={() => setLang(l.code)} style={[styles.lang, lang === l.code && styles.langActive]} accessibilityLabel={l.label}>
                <Text style={[styles.langText, lang === l.code && styles.langTextActive]}>{l.code.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hello}>
            {t(lang, "greeting")}, {me.name}
          </Text>
        </View>

        {openIndex === null ? (
          <VisitList lang={lang} visits={visits} onOpen={setOpenIndex} onSick={() => setNotice(t(lang, "reportSent"))} />
        ) : (
          <VisitDetail lang={lang} visit={visits[openIndex]} onBack={() => setOpenIndex(null)} onFinish={() => finish(openIndex)} onReport={() => setNotice(t(lang, "reportSent"))} />
        )}

        {notice && (
          <View style={styles.toast}>
            <Text style={styles.toastText}>{notice}</Text>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function VisitList({ lang, visits, onOpen, onSick }: { lang: Language; visits: Visit[]; onOpen: (i: number) => void; onSick: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.label}>{t(lang, "myVisits")}</Text>
      {visits.length === 0 && <Text style={styles.muted}>{t(lang, "noVisits")}</Text>}
      {visits.map((v, i) => {
        const site = siteById(v.siteId);
        const done = v.status === "erledigt";
        return (
          <Pressable key={v.siteId + v.startTime} style={styles.job} onPress={() => onOpen(i)}>
            <Text style={styles.jobTime}>{v.startTime}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.jobName}>{site.name}</Text>
              <Text style={styles.muted}>{site.address}</Text>
              <Text style={[styles.pill, { color: done ? c.ok : c.muted }]}>{t(lang, done ? "done" : "open")}</Text>
            </View>
          </Pressable>
        );
      })}
      <Pressable style={[styles.button, styles.ghost]} onPress={onSick}>
        <Text style={styles.ghostText}>{t(lang, "reportSick")}</Text>
      </Pressable>
    </ScrollView>
  );
}

function VisitDetail({ lang, visit, onBack, onFinish, onReport }: { lang: Language; visit: Visit; onBack: () => void; onFinish: () => void; onReport: () => void }) {
  const site = siteById(visit.siteId);
  // Später: Standort oder QR-Code im Objekt prüfen und Eintrag in time_entries speichern.
  const [clockedInAt, setClockedInAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [reporting, setReporting] = useState(false);
  const [reportText, setReportText] = useState("");

  useEffect(() => {
    if (clockedInAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [clockedInAt]);

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Pressable onPress={onBack} accessibilityRole="button">
        <Text style={styles.back}>‹ {t(lang, "back")}</Text>
      </Pressable>
      <View>
        <Text style={styles.title}>{site.name}</Text>
        <Text style={styles.muted}>
          {visit.startTime} · {site.address}
        </Text>
      </View>

      <View style={styles.clock}>
        {clockedInAt !== null && (
          <>
            <Text style={styles.label}>{t(lang, "runningFor")}</Text>
            <Text style={styles.clockTime}>{formatDuration(now - clockedInAt)}</Text>
          </>
        )}
        <Pressable
          style={[styles.button, styles.big, clockedInAt === null ? styles.signal : styles.primary]}
          onPress={() => (clockedInAt === null ? (setClockedInAt(Date.now()), setNow(Date.now())) : onFinish())}
        >
          <Text style={clockedInAt === null ? styles.signalText : styles.primaryText}>{t(lang, clockedInAt === null ? "clockIn" : "clockOut")}</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>
        {t(lang, "checklist")} · {checked.size}/{Object.keys(checklist).length}
      </Text>
      {Object.entries(checklist).map(([key, label]) => {
        const on = checked.has(key);
        return (
          <Pressable key={key} style={styles.check} onPress={() => toggle(key)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
            <View style={[styles.box, on && styles.boxOn]}>{on && <Text style={styles.boxMark}>✓</Text>}</View>
            <Text style={[styles.checkText, on && styles.checkTextOn]}>{label[lang]}</Text>
          </Pressable>
        );
      })}

      {reporting ? (
        <View style={{ gap: 8 }}>
          <TextInput style={styles.input} multiline placeholder={t(lang, "problemPlaceholder")} value={reportText} onChangeText={setReportText} />
          <Pressable
            style={[styles.button, styles.primary]}
            onPress={() => {
              setReporting(false);
              setReportText("");
              onReport();
            }}
          >
            <Text style={styles.primaryText}>{t(lang, "send")}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={[styles.button, styles.ghost]} onPress={() => setReporting(true)}>
          <Text style={styles.ghostText}>{t(lang, "reportProblem")}</Text>
        </Pressable>
      )}

      <Text style={styles.label}>{t(lang, "siteInfo")}</Text>
      <View style={styles.info}>
        {site.accessNotes && <InfoRow label={t(lang, "access")} value={site.accessNotes} />}
        {site.contact && <InfoRow label={t(lang, "contact")} value={site.contact} />}
        {site.specialNotes && <InfoRow label={t(lang, "special")} value={site.specialNotes} />}
      </View>
    </ScrollView>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.surface },
  header: { backgroundColor: c.primary, padding: 18, gap: 12 },
  langs: { flexDirection: "row", gap: 6, alignSelf: "flex-end" },
  lang: { borderWidth: 1, borderColor: c.onPrimary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, opacity: 0.7 },
  langActive: { backgroundColor: c.onPrimary, opacity: 1 },
  langText: { color: c.onPrimary, fontWeight: "700", fontSize: 12 },
  langTextActive: { color: c.primary },
  hello: { color: c.onPrimary, fontSize: 24, fontWeight: "800" },
  body: { padding: 16, gap: 12 },
  label: { fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: c.muted, fontWeight: "600" },
  muted: { color: c.muted, fontSize: 14 },
  title: { fontSize: 20, fontWeight: "700", color: c.text },
  back: { fontSize: 16, fontWeight: "600", color: c.primary },
  job: { flexDirection: "row", gap: 12, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 14 },
  jobTime: { fontSize: 18, fontWeight: "800", color: c.text, width: 56 },
  jobName: { fontSize: 16, fontWeight: "700", color: c.text },
  pill: { fontSize: 13, fontWeight: "700", marginTop: 4 },
  clock: { backgroundColor: c.soft, borderRadius: 12, padding: 14, alignItems: "center", gap: 6 },
  clockTime: { fontSize: 36, fontWeight: "800", color: c.text, fontVariant: ["tabular-nums"] },
  button: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, alignItems: "center" },
  big: { alignSelf: "stretch", paddingVertical: 18 },
  primary: { backgroundColor: c.primary },
  primaryText: { color: c.onPrimary, fontWeight: "700", fontSize: 17 },
  signal: { backgroundColor: c.signal },
  signalText: { color: c.onSignal, fontWeight: "700", fontSize: 17 },
  ghost: { backgroundColor: c.soft },
  ghostText: { color: c.text, fontWeight: "700", fontSize: 16 },
  check: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: c.line, borderRadius: 10, padding: 12 },
  box: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: c.line, alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: c.ok, borderColor: c.ok },
  boxMark: { color: "#fff", fontWeight: "800" },
  checkText: { fontSize: 16, color: c.text, flex: 1 },
  checkTextOn: { color: c.muted, textDecorationLine: "line-through" },
  input: { borderWidth: 1, borderColor: c.line, borderRadius: 10, padding: 12, minHeight: 80, fontSize: 16, textAlignVertical: "top" },
  info: { gap: 6 },
  toast: { position: "absolute", left: 16, right: 16, bottom: 32, backgroundColor: c.text, borderRadius: 12, padding: 14 },
  toastText: { color: c.surface, fontWeight: "600", textAlign: "center" },
});
