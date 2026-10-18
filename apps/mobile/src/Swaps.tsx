import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { berlinDate, brand, shortDate, t, type Language, type TextKey } from "@gp/shared";
import { addDaysIso, errorText, loadSwaps, offerSwap, rescheduleVisit, RESCHEDULE_DAYS, takeSwap, withdrawSwap, type OpenSwap, type UpcomingVisit } from "./data";
import { DateStepper, TimeStepper } from "./Extras";
import { Button, feel } from "./ui";
import { styles } from "./styles";

const c = brand.colors;

/** Schichttausch auf der Startseite: Angebote von Kollegen übernehmen, eigene Einsätze abgeben oder verschieben. */
export function Swaps({ lang, userId, notify, onChanged }: { lang: Language; userId: string; notify: (key: TextKey) => void; onChanged: () => void }) {
  const [data, setData] = useState<{ open: OpenSwap[]; mine: UpcomingVisit[] } | null>(null);
  const [giving, setGiving] = useState(false);
  const [moving, setMoving] = useState(false);
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

      {moving ? (
        <Reschedule lang={lang} visits={data.mine.filter((v) => !v.swap && v.date <= addDaysIso(berlinDate(), RESCHEDULE_DAYS))} notify={notify} onClose={() => setMoving(false)} onDone={() => { setMoving(false); load(); onChanged(); }} />
      ) : (
        !giving && <Button label={t(lang, "rescheduleTitle")} icon="calendar-outline" onPress={() => setMoving(true)} />
      )}

      {moving ? null : giving ? (
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

/** Eigenen Einsatz auf einen anderen Tag oder eine andere Uhrzeit legen (z. B. bei Schlüsselobjekten). */
function Reschedule({ lang, visits, notify, onClose, onDone }: { lang: Language; visits: UpcomingVisit[]; notify: (key: TextKey) => void; onClose: () => void; onDone: () => void }) {
  const today = berlinDate();
  const [visit, setVisit] = useState<UpcomingVisit | null>(null);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("08:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TextKey | null>(null);

  const pick = (v: UpcomingVisit) => {
    feel.tap();
    setVisit(v);
    setDate(v.date);
    setTime(v.startTime);
    setError(null);
  };

  const save = async () => {
    if (!visit) return;
    setBusy(true);
    setError(null);
    try {
      await rescheduleVisit(visit.id, date, time);
      feel.success();
      notify("rescheduleDone");
      onDone();
    } catch (e) {
      feel.warn();
      setError(errorText(e as { message?: string }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, { gap: 8 }]}>
      <Text style={styles.jobName}>{t(lang, "rescheduleTitle")}</Text>
      {visit ? (
        <>
          <Text style={{ color: c.text, fontWeight: "700" }}>{visit.siteName}</Text>
          <Text style={styles.muted}>{t(lang, "rescheduleHint")}</Text>
          <DateStepper lang={lang} label={t(lang, "day")} value={date} min={today} max={addDaysIso(today, RESCHEDULE_DAYS)} onChange={setDate} />
          <TimeStepper label={t(lang, "time")} value={time} onChange={setTime} />
          {error && <Text style={styles.error}>{t(lang, error)}</Text>}
          <View style={styles.row}>
            <Button label={t(lang, "cancel")} onPress={() => setVisit(null)} style={{ flex: 1 }} />
            <Button label={t(lang, "save")} variant="primary" busy={busy} disabled={date === visit.date && time === visit.startTime} onPress={save} style={{ flex: 1 }} />
          </View>
        </>
      ) : (
        <>
          {visits.length === 0 && <Text style={styles.muted}>{t(lang, "swapNone")}</Text>}
          {visits.map((v) => (
            <View key={v.id} style={[styles.buttonRow, { justifyContent: "space-between" }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: "700" }}>{v.siteName}</Text>
                <Text style={styles.muted}>
                  {shortDate(lang, v.date)} · {v.startTime}
                </Text>
              </View>
              <Button label={t(lang, "reschedule")} onPress={() => pick(v)} />
            </View>
          ))}
          <Button label={t(lang, "cancel")} onPress={onClose} />
        </>
      )}
    </View>
  );
}
