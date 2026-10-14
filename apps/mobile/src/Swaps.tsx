import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { brand, shortDate, t, type Language, type TextKey } from "@gp/shared";
import { loadSwaps, offerSwap, takeSwap, withdrawSwap, type OpenSwap, type UpcomingVisit } from "./data";
import { Button, feel } from "./ui";
import { styles } from "./styles";

const c = brand.colors;

/** Schichttausch auf der Startseite: Angebote von Kollegen übernehmen und eigene Einsätze abgeben. */
export function Swaps({ lang, userId, notify, onChanged }: { lang: Language; userId: string; notify: (key: TextKey) => void; onChanged: () => void }) {
  const [data, setData] = useState<{ open: OpenSwap[]; mine: UpcomingVisit[] } | null>(null);
  const [giving, setGiving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    loadSwaps(userId).then(setData).catch(() => {});
  }, [userId]);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (id: string, action: () => Promise<void>, done?: TextKey) => {
    setBusy(id);
    try {
      await action();
      feel.success();
      if (done) notify(done);
      load();
      onChanged();
    } catch {
      feel.warn();
      notify("networkError");
      load();
    } finally {
      setBusy(null);
    }
  };

  if (!data) return null;
  const offered = data.mine.filter((v) => v.swap);
  const when = (date: string, time: string) => `${shortDate(lang, date)} · ${time}`;

  return (
    <>
      {data.open.length > 0 && (
        <>
          <Text style={styles.label}>{t(lang, "swapOpen")}</Text>
          {data.open.map((o) => (
            <View key={o.id} style={[styles.card, { gap: 8 }]}>
              <View style={styles.buttonRow}>
                <Ionicons name="swap-horizontal" size={24} color={c.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.jobName}>{o.site_name}</Text>
                  <Text style={styles.muted}>
                    {when(o.date, o.start_time)} · {o.offered_by_name}
                  </Text>
                  {o.note && <Text style={styles.muted}>„{o.note}“</Text>}
                </View>
              </View>
              <Button label={t(lang, "swapTake")} icon="hand-left-outline" variant="primary" busy={busy === o.id} onPress={() => run(o.id, () => takeSwap(o.id), "swapTakeDone")} />
            </View>
          ))}
        </>
      )}

      {offered.map((v) => (
        <View key={v.id} style={[styles.card, styles.buttonRow]}>
          <Ionicons name="time-outline" size={24} color={c.warn} />
          <View style={{ flex: 1 }}>
            <Text style={styles.jobName}>{v.siteName}</Text>
            <Text style={styles.muted}>{when(v.date, v.startTime)}</Text>
            <Text style={[styles.muted, { color: c.text }]}>
              {v.swap?.status === "angenommen" ? t(lang, "swapTakenBy").replace("{name}", v.swap.takenBy ?? "") : t(lang, "swapOffered")}
            </Text>
          </View>
          <Button label={t(lang, "swapWithdraw")} busy={busy === v.swap!.id} onPress={() => run(v.swap!.id, () => withdrawSwap(v.swap!.id))} />
        </View>
      ))}

      {giving ? (
        <View style={[styles.card, { gap: 8 }]}>
          <Text style={styles.jobName}>{t(lang, "swapGiveAway")}</Text>
          <Text style={styles.muted}>{t(lang, "swapGiveHint")}</Text>
          {data.mine.length === 0 && <Text style={styles.muted}>{t(lang, "swapNone")}</Text>}
          {data.mine
            .filter((v) => !v.swap)
            .map((v) => (
              <View key={v.id} style={[styles.buttonRow, { justifyContent: "space-between" }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: "700" }}>{v.siteName}</Text>
                  <Text style={styles.muted}>{when(v.date, v.startTime)}</Text>
                </View>
                {busy === v.id ? <ActivityIndicator color={c.primary} /> : <Button label={t(lang, "swapOffer")} onPress={() => run(v.id, () => offerSwap(v.id))} />}
              </View>
            ))}
          <Button label={t(lang, "cancel")} onPress={() => setGiving(false)} />
        </View>
      ) : (
        <Button label={t(lang, "swapGiveAway")} icon="swap-horizontal" onPress={() => setGiving(true)} />
      )}
    </>
  );
}
