import AsyncStorage from "@react-native-async-storage/async-storage";
import { berlinDate, isNetworkError, type ProfileRow, type TextKey, type TimeEntryRow } from "@gp/shared";
import { clockIn, clockOut, errorText, openEntryId, sendReport, setChecked, type Day, type NewReport, type Place } from "./data";

// Postausgang: Was ohne Netz passiert, wird hier gespeichert und nachgesendet,
// sobald wieder Empfang da ist. Die Reihenfolge bleibt erhalten.

export type Action =
  | { type: "clockIn"; visitId: string; place: Place; at: string }
  | { type: "clockOut"; visitId: string; at: string }
  | { type: "check"; visitId: string; itemId: string; on: boolean }
  | ({ type: "report"; at: string } & NewReport);

export type Queued = Action & { id: string };

const key = (userId: string) => `gp-outbox-${userId}`;
const dayKey = (userId: string) => `gp-day-${userId}`;

export async function loadOutbox(userId: string): Promise<Queued[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(key(userId))) ?? "[]") as Queued[];
  } catch {
    return [];
  }
}

async function saveOutbox(userId: string, items: Queued[]) {
  await AsyncStorage.setItem(key(userId), JSON.stringify(items));
}

export async function enqueue(userId: string, action: Action): Promise<Queued[]> {
  const items = [...(await loadOutbox(userId)), { ...action, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }];
  await saveOutbox(userId, items);
  return items;
}

/** Führt eine Aktion beim Server aus. `late`: wird nachgesendet, also mit gespeicherter Zeit. */
export async function perform(profile: ProfileRow, action: Action, late: boolean) {
  switch (action.type) {
    case "clockIn":
      return clockIn(action.visitId, action.place, late ? action.at : undefined);
    case "clockOut": {
      const id = await openEntryId(profile.id);
      if (!id) throw { message: "nicht_eingestempelt" };
      return clockOut(id, late ? action.at : undefined);
    }
    case "check":
      return setChecked(profile, action.visitId, action.itemId, action.on);
    case "report":
      return sendReport(profile, action);
  }
}

/**
 * Sendet den Postausgang der Reihe nach. Fehlt das Netz noch, bleibt der Rest liegen.
 * Lehnt der Server eine Aktion ab (z. B. nicht am Objekt), wird sie verworfen und gemeldet.
 */
export async function flush(profile: ProfileRow): Promise<{ sent: number; rejected: TextKey[]; left: number }> {
  const items = await loadOutbox(profile.id);
  let sent = 0;
  const rejected: TextKey[] = [];
  while (items.length) {
    try {
      await perform(profile, items[0], true);
      sent++;
    } catch (e) {
      if (isNetworkError(e as { message?: string })) break;
      rejected.push(errorText(e as { message?: string }));
    }
    items.shift();
    await saveOutbox(profile.id, items);
  }
  return { sent, rejected, left: items.length };
}

/** Zeigt noch nicht gesendete Aktionen schon in der Ansicht an. */
export function applyToDay(day: Day, action: Action): Day {
  const setStatus = (status: "laeuft" | "erledigt") => day.visits.map((v) => (v.id === action.visitId ? { ...v, status } : v));
  switch (action.type) {
    case "clockIn": {
      const entry: TimeEntryRow = { id: "offline", visit_id: action.visitId, employee_id: "", clock_in_at: action.at, clock_out_at: null, method: "token" in action.place ? "qr" : "gps" };
      return { ...day, visits: setStatus("laeuft"), openEntry: entry };
    }
    case "clockOut":
      return { ...day, visits: setStatus("erledigt"), openEntry: null };
    case "check": {
      const current = new Set(day.checked[action.visitId] ?? []);
      if (action.on) current.add(action.itemId);
      else current.delete(action.itemId);
      return { ...day, checked: { ...day.checked, [action.visitId]: [...current] } };
    }
    default:
      return day;
  }
}

// Letzter bekannter Tag, damit die App auch ohne Netz die Einsätze zeigt.
export async function saveDay(userId: string, day: Day) {
  try {
    await AsyncStorage.setItem(dayKey(userId), JSON.stringify({ date: berlinDate(), day }));
  } catch {
    // Speicher voll: dann eben ohne Zwischenspeicher.
  }
}

export async function cachedDay(userId: string): Promise<Day | null> {
  try {
    const raw = await AsyncStorage.getItem(dayKey(userId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { date: string; day: Day };
    // Ein Tag von gestern zählt nur, wenn dort noch ein Einsatz läuft (Nachtschicht).
    return saved.date === berlinDate() || saved.day.openEntry ? saved.day : null;
  } catch {
    return null;
  }
}
