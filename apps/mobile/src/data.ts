import {
  berlinDate,
  cleanChatText,
  clockErrorKey,
  type ChatMessage,
  siteFromRow,
  visitFromRow,
  type ChecklistItemRow,
  type ProfileRow,
  type Site,
  type SiteRow,
  type TextKey,
  type TimeEntryRow,
  type Visit,
  type VisitRow,
} from "@gp/shared";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { supabase } from "./supabase";

export type MyVisit = Visit & { id: string; site: Site & { latitude: number | null; longitude: number | null } };

export interface Day {
  visits: MyVisit[];
  checklist: ChecklistItemRow[];
  /** checklist_item_id je Einsatz */
  checked: Record<string, string[]>;
  openEntry: TimeEntryRow | null;
}

export async function loadProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
}

/** Lädt die Einsätze von heute (und einen noch laufenden von gestern). */
export async function loadDay(userId: string): Promise<Day> {
  const today = berlinDate();
  // Einsätze aus den wiederkehrenden Serien anlegen, falls das Büro das noch nicht getan hat.
  await supabase.rpc("ensure_visits", { p_from: today, p_to: today });

  const [{ data: entries, error: e1 }, { data: visitRows, error: e2 }] = await Promise.all([
    supabase.from("time_entries").select("*").eq("employee_id", userId).is("clock_out_at", null).limit(1),
    supabase.from("visits").select("*").eq("employee_id", userId).eq("date", today).neq("status", "ausgefallen").order("start_time"),
  ]);
  if (e1 || e2) throw e1 ?? e2;
  const openEntry = (entries?.[0] as TimeEntryRow | undefined) ?? null;
  const rows = (visitRows ?? []) as VisitRow[];

  // Läuft noch ein Einsatz von gestern (Nachtschicht), gehört er dazu.
  if (openEntry?.visit_id && !rows.some((r) => r.id === openEntry.visit_id)) {
    const { data } = await supabase.from("visits").select("*").eq("id", openEntry.visit_id).maybeSingle();
    if (data) rows.unshift(data as VisitRow);
  }
  if (rows.length === 0) return { visits: [], checklist: [], checked: {}, openEntry };

  const siteIds = [...new Set(rows.map((r) => r.site_id))];
  const visitIds = rows.map((r) => r.id);
  const [{ data: sites, error: e3 }, { data: items, error: e4 }, { data: checks, error: e5 }] = await Promise.all([
    supabase.from("sites").select("*").in("id", siteIds),
    supabase.from("checklist_items").select("*").in("site_id", siteIds).eq("active", true).order("position"),
    supabase.from("checklist_checks").select("visit_id, checklist_item_id").in("visit_id", visitIds),
  ]);
  if (e3 || e4 || e5) throw e3 ?? e4 ?? e5;

  const siteMap = new Map((sites as SiteRow[]).map((s) => [s.id, { ...siteFromRow(s), latitude: s.latitude, longitude: s.longitude }]));
  const checked: Record<string, string[]> = {};
  for (const c of checks ?? []) (checked[c.visit_id] ??= []).push(c.checklist_item_id);

  return {
    visits: rows.filter((r) => siteMap.has(r.site_id)).map((r) => ({ ...visitFromRow(r), id: r.id, site: siteMap.get(r.site_id)! })),
    checklist: (items ?? []) as ChecklistItemRow[],
    checked,
    openEntry,
  };
}

/** Übersetzt einen Datenbankfehler in einen Text für den Mitarbeiter. */
export function errorText(error: { message?: string } | null | undefined): TextKey {
  const key = clockErrorKey(error?.message);
  return key ? (`err_${key}` as TextKey) : "networkError";
}

export type Place = { latitude: number; longitude: number } | { token: string };

/** `at`: Zeitpunkt, wenn ohne Netz gestempelt und später gesendet wird. */
export async function clockIn(visitId: string, place: Place, at?: string) {
  const args = "token" in place
    ? { p_visit_id: visitId, p_token: place.token, p_at: at }
    : { p_visit_id: visitId, p_latitude: place.latitude, p_longitude: place.longitude, p_at: at };
  const { data, error } = await supabase.rpc("clock_in", args);
  if (error) throw error;
  return data as TimeEntryRow;
}

export async function clockOut(entryId: string, at?: string) {
  const { error } = await supabase.rpc("clock_out", { p_entry_id: entryId, p_at: at });
  if (error) throw error;
}

/** Offener Zeiteintrag; beim Nachsenden kennt die App seine Nummer noch nicht. */
export async function openEntryId(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("time_entries").select("id").eq("employee_id", userId).is("clock_out_at", null).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function setChecked(profile: ProfileRow, visitId: string, itemId: string, on: boolean) {
  const { error } = on
    ? await supabase.from("checklist_checks").upsert({ visit_id: visitId, checklist_item_id: itemId, company_id: profile.company_id, checked_by: profile.id }, { onConflict: "visit_id,checklist_item_id", ignoreDuplicates: true })
    : await supabase.from("checklist_checks").delete().eq("visit_id", visitId).eq("checklist_item_id", itemId);
  if (error) throw error;
}

export type ReportKind = "problem" | "material";

/** Ein Foto für eine Meldung, schon verkleinert (JPEG als Base64), damit es auch offline gespeichert werden kann. */
export interface ReportPhoto {
  uri: string;
  base64: string;
}

const PHOTO_WIDTH = 1600;

export async function preparePhoto(uri: string, width: number): Promise<ReportPhoto> {
  let context = ImageManipulator.manipulate(uri);
  if (width > PHOTO_WIDTH) context = context.resize({ width: PHOTO_WIDTH });
  const image = await (await context.renderAsync()).saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
  return { uri: image.uri, base64: image.base64 ?? "" };
}

async function uploadPhoto(profile: ProfileRow, base64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  // Ordner = Firma/Mitarbeiter; daran hängen die Zugriffsregeln im Speicher.
  const path = `${profile.company_id}/${profile.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from("fotos").upload(path, bytes, { contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}

export interface NewReport {
  visitId: string;
  siteId: string;
  kind: ReportKind;
  text: string;
  photos: string[];
}

export async function sendReport(profile: ProfileRow, report: NewReport) {
  const photoPaths = [];
  for (const photo of report.photos) photoPaths.push(await uploadPhoto(profile, photo));
  const { error } = await supabase.from("reports").insert({
    company_id: profile.company_id,
    site_id: report.siteId,
    visit_id: report.visitId,
    author_id: profile.id,
    kind: report.kind,
    text: report.text,
    photo_paths: photoPaths,
  });
  if (error) throw error;
}

export interface MyReport {
  id: string;
  kind: ReportKind | "reklamation";
  text: string;
  status: "offen" | "erledigt";
  created_at: string;
  photoCount: number;
  siteName: string;
}

export async function loadMyReports(userId: string): Promise<MyReport[]> {
  const { data, error } = await supabase
    .from("reports")
    .select("id, kind, text, status, created_at, photo_paths, sites(name)")
    .eq("author_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const site = (Array.isArray(r.sites) ? r.sites[0] : r.sites) as { name: string } | null;
    return { id: r.id, kind: r.kind, text: r.text, status: r.status, created_at: r.created_at, photoCount: (r.photo_paths ?? []).length, siteName: site?.name ?? "" };
  });
}

export async function saveLanguage(profile: ProfileRow, language: ProfileRow["language"]) {
  await supabase.from("profiles").update({ language }).eq("id", profile.id);
}

/** QR-Aufkleber enthalten den Schlüssel, ggf. am Ende eines Links. */
export function tokenFromQr(data: string): string {
  return data.trim().split("/").filter(Boolean).pop() ?? "";
}

// Nachrichten -------------------------------------------------------------------------

export interface Message {
  id: string;
  kind: string;
  params: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
}

export async function loadMessages(userId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, params, created_at, read_at")
    .eq("user_id", userId)
    .neq("kind", "chat")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function unreadCount(userId: string): Promise<number> {
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).neq("kind", "chat").is("read_at", null);
  return count ?? 0;
}

export async function markAllRead(userId: string) {
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).neq("kind", "chat").is("read_at", null);
}

// Chat mit der Leitung -----------------------------------------------------------------

export type ChatEntry = ChatMessage & { authorName: string | null };

/** Eigenes Gespräch mit der Leitung, älteste zuerst. */
export async function loadChat(userId: string): Promise<ChatEntry[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, employee_id, author_id, body, created_at, profiles!chat_messages_author_id_fkey(full_name)")
    .eq("employee_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? [])
    .map((m) => {
      const author = m.profiles as unknown as { full_name: string } | { full_name: string }[] | null;
      return { ...m, authorName: (Array.isArray(author) ? author[0] : author)?.full_name ?? null } as ChatEntry;
    })
    .reverse();
}

export async function sendChat(profile: ProfileRow, body: string) {
  const text = cleanChatText(body);
  if (!text) return;
  const { error } = await supabase.from("chat_messages").insert({ company_id: profile.company_id, employee_id: profile.id, author_id: profile.id, body: text });
  if (error) throw error;
}

export async function markChatRead(profile: ProfileRow) {
  await supabase
    .from("chat_reads")
    .upsert({ user_id: profile.id, employee_id: profile.id, company_id: profile.company_id, last_read_at: new Date().toISOString() });
}

/** Ungelesene Antworten der Leitung für das Zeichen am Reiter. */
export async function chatUnreadCount(userId: string): Promise<number> {
  const { data: read } = await supabase.from("chat_reads").select("last_read_at").eq("user_id", userId).eq("employee_id", userId).maybeSingle();
  let query = supabase.from("chat_messages").select("id", { count: "exact", head: true }).eq("employee_id", userId).neq("author_id", userId);
  if (read?.last_read_at) query = query.gt("created_at", read.last_read_at);
  const { count } = await query;
  return count ?? 0;
}

// Urlaub und Krank --------------------------------------------------------------------

export interface MyAbsence {
  id: string;
  kind: "krank" | "urlaub";
  date_from: string;
  date_to: string;
  approved: boolean | null;
}

export async function loadMyAbsences(userId: string): Promise<MyAbsence[]> {
  const { data, error } = await supabase
    .from("absences")
    .select("id, kind, date_from, date_to, approved")
    .eq("employee_id", userId)
    .gte("date_to", addDaysIso(berlinDate(), -60))
    .order("date_from", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MyAbsence[];
}

export async function requestAbsence(profile: ProfileRow, kind: MyAbsence["kind"], from: string, to: string, note: string) {
  const { error } = await supabase.from("absences").insert({
    company_id: profile.company_id,
    employee_id: profile.id,
    kind,
    date_from: from,
    date_to: to,
    note: note.trim() || null,
  });
  if (error) throw error;
}

export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
