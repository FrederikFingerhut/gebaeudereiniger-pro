import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { brand, t, type Language, type ProfileRow, type TextKey } from "@gp/shared";
import { loadMyAccount, payslipUrl, type MyAccount } from "./data";
import { feel } from "./ui";
import { styles } from "./styles";

const c = brand.colors;
const locales: Record<Language, string> = { de: "de-DE", en: "en-GB", ru: "ru-RU", uk: "uk-UA" };

/** Arbeitszeitkonto und Lohnabrechnungen im Profil. */
export function Account({ lang, profile, notify }: { lang: Language; profile: ProfileRow; notify: (key: TextKey) => void }) {
  const [data, setData] = useState<MyAccount | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    loadMyAccount(profile)
      .then((d) => {
        setData(d);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [profile]);
  useEffect(() => {
    load();
  }, [load]);

  const h = (minutes: number) => `${(minutes / 60).toLocaleString(locales[lang], { maximumFractionDigits: 1 })} ${t(lang, "hoursShort")}`;
  const number = (n: number) => n.toLocaleString(locales[lang], { maximumFractionDigits: 1 });
  const month = (period: string) =>
    new Intl.DateTimeFormat(locales[lang], { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period.slice(0, 7)}-01T00:00:00Z`));

  const open = async (path: string) => {
    feel.tap();
    try {
      const url = await payslipUrl(path);
      if (Platform.OS === "web" && typeof window !== "undefined") window.open(url, "_blank", "noopener");
      else await Linking.openURL(url);
    } catch {
      notify("networkError");
    }
  };

  if (!data) return <View style={styles.card}>{failed ? <Text style={styles.muted}>{t(lang, "offline")}</Text> : <ActivityIndicator color={c.primary} />}</View>;
  const { account } = data;
  const balance = account.balanceMinutes;

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.card}>
        <Row label={t(lang, "hoursThisMonth")} value={h(account.workedMinutes)} strong />
        {account.targetMinutes !== null && <Row label={t(lang, "targetHours")} value={h(account.targetMinutes)} />}
        {balance !== null && (
          <Row label={t(lang, "balance")} value={`${balance > 0 ? "+" : balance < 0 ? "−" : "±"}${h(Math.abs(balance))}`} color={balance < 0 ? c.warn : c.ok} />
        )}
        <Row label={t(lang, "vacationLeft")} value={`${number(data.vacationLeft)} ${t(lang, "days")}`} />
        {account.sickDays > 0 && <Row label={t(lang, "sickDays")} value={`${number(account.sickDays)} ${t(lang, "days")}`} />}
      </View>
      <Text style={styles.label}>{t(lang, "payslips")}</Text>
      {data.payslips.length === 0 && <Text style={styles.muted}>{t(lang, "noPayslips")}</Text>}
      {data.payslips.map((p) => (
        <Pressable key={p.id} style={({ pressed }) => [styles.card, styles.buttonRow, pressed && { opacity: 0.7 }]} onPress={() => open(p.path)} accessibilityRole="link">
          <Ionicons name="document-text-outline" size={24} color={c.primary} />
          <Text style={[styles.jobName, { flex: 1 }]}>{month(p.period)}</Text>
          <Ionicons name="open-outline" size={20} color={c.muted} />
        </Pressable>
      ))}
    </View>
  );
}

function Row({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color?: string }) {
  return (
    <View style={[styles.buttonRow, { justifyContent: "space-between" }]}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={[strong ? styles.jobName : { fontSize: 15, fontWeight: "600", color: c.text }, color ? { color } : null]}>{value}</Text>
    </View>
  );
}
