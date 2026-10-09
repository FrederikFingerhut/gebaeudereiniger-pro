import { Platform, StyleSheet } from "react-native";
import { brand } from "@gp/shared";

const c = brand.colors;

// Weicher Schatten für Karten, auf allen Geräten gleich.
const shadow = Platform.select({
  web: { boxShadow: "0 1px 2px rgba(20,33,43,0.06), 0 4px 14px rgba(20,33,43,0.06)" },
  default: { shadowColor: c.text, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
});

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.primary },
  main: { flex: 1, backgroundColor: c.background },
  header: { backgroundColor: c.primary, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 18 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 40, height: 40, borderRadius: 10 },
  hello: { color: c.onPrimary, fontSize: 22, fontWeight: "800" },
  date: { color: c.onPrimary, opacity: 0.75, fontSize: 14, marginTop: 1 },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  label: { fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: c.muted, fontWeight: "700", marginTop: 4 },
  muted: { color: c.muted, fontSize: 14 },
  error: { color: c.bad, fontSize: 15, fontWeight: "600" },
  title: { fontSize: 22, fontWeight: "800", color: c.text },
  back: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start", paddingVertical: 6, paddingRight: 12 },
  backText: { fontSize: 16, fontWeight: "700", color: c.primary },

  card: { backgroundColor: c.surface, borderRadius: 16, padding: 16, gap: 8, ...shadow },
  job: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: c.surface, borderRadius: 16, padding: 16, ...shadow },
  jobDone: { opacity: 0.6 },
  jobTime: { fontSize: 18, fontWeight: "800", color: c.text, width: 56, fontVariant: ["tabular-nums"] },
  jobName: { fontSize: 17, fontWeight: "700", color: c.text },
  pill: { alignSelf: "flex-start", fontSize: 12, fontWeight: "800", marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: "hidden" },

  // Laufender Einsatz oben auf „Heute“
  hero: { backgroundColor: c.primary, borderRadius: 20, padding: 18, gap: 6, ...shadow },
  heroLabel: { color: c.onPrimary, opacity: 0.8, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  heroTitle: { color: c.onPrimary, fontSize: 20, fontWeight: "800" },
  heroTime: { color: c.signal, fontSize: 40, fontWeight: "800", fontVariant: ["tabular-nums"] },

  clock: { backgroundColor: c.surface, borderRadius: 20, padding: 18, alignItems: "center", gap: 10, ...shadow },
  clockTime: { fontSize: 44, fontWeight: "800", color: c.text, fontVariant: ["tabular-nums"] },
  button: { borderRadius: 14, minHeight: 52, paddingVertical: 14, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  buttonRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  big: { alignSelf: "stretch", minHeight: 64, paddingVertical: 18, borderRadius: 18 },
  primary: { backgroundColor: c.primary },
  primaryText: { color: c.onPrimary, fontWeight: "800", fontSize: 17 },
  signal: { backgroundColor: c.signal },
  signalText: { color: c.onSignal, fontWeight: "800", fontSize: 18 },
  ghost: { backgroundColor: c.soft },
  ghostText: { color: c.text, fontWeight: "700", fontSize: 16 },

  check: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surface, borderRadius: 14, padding: 14, minHeight: 56, ...shadow },
  box: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: c.line, alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: c.ok, borderColor: c.ok },
  checkText: { fontSize: 16, color: c.text, flex: 1 },
  checkTextOn: { color: c.muted, textDecorationLine: "line-through" },
  progress: { height: 6, borderRadius: 3, backgroundColor: c.line, overflow: "hidden" },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: c.ok },

  field: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 14, fontSize: 16, color: c.text },
  input: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 14, minHeight: 90, fontSize: 16, color: c.text, textAlignVertical: "top" },
  info: { gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  chip: { flex: 1, backgroundColor: c.surface, borderWidth: 2, borderColor: c.line, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  chipOn: { borderColor: c.primary, backgroundColor: c.soft },
  chipText: { color: c.text, fontWeight: "700", fontSize: 15 },
  thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: c.soft },
  thumbRemove: { position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: c.text, alignItems: "center", justifyContent: "center" },

  toast: { position: "absolute", left: 16, right: 16, bottom: 96, backgroundColor: c.text, borderRadius: 14, padding: 14, ...shadow },
  toastText: { color: c.surface, fontWeight: "600", textAlign: "center" },
  offlineBar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.signal, paddingHorizontal: 16, paddingVertical: 8 },
  offlineText: { color: c.onSignal, fontWeight: "700", fontSize: 13, flex: 1 },

  tabBar: { flexDirection: "row", backgroundColor: c.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, paddingTop: 6, paddingBottom: 4 },
  tab: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 4 },
  tabIcon: { paddingHorizontal: 18, paddingVertical: 4, borderRadius: 999 },
  tabIconOn: { backgroundColor: c.soft },
  tabLabel: { fontSize: 12, fontWeight: "600", color: c.muted },
  tabLabelOn: { color: c.primary, fontWeight: "800" },
  badge: { position: "absolute", top: 0, right: 8, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.signal, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: c.onSignal, fontSize: 11, fontWeight: "800" },

  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.94)", alignItems: "center", justifyContent: "center", gap: 10 },
  doneCircle: { width: 128, height: 128, borderRadius: 64, backgroundColor: c.ok, alignItems: "center", justifyContent: "center" },
  doneTitle: { fontSize: 26, fontWeight: "800", color: c.text, marginTop: 8 },
  doneSubtitle: { fontSize: 16, color: c.muted },

  bubble: { maxWidth: "85%", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: c.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: { alignSelf: "flex-start", backgroundColor: c.surface, borderBottomLeftRadius: 4, ...shadow },
  bubbleAuthor: { fontSize: 12, fontWeight: "800", color: c.primary },
  bubbleText: { fontSize: 16, color: c.text },
  bubbleTime: { fontSize: 11, color: c.muted, opacity: 0.8, alignSelf: "flex-end" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 10, backgroundColor: c.background, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  composerInput: { flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, fontSize: 16, color: c.text, maxHeight: 120 },
  sendButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },

  stepper: { width: 48, height: 48, borderRadius: 12, backgroundColor: c.soft, alignItems: "center", justifyContent: "center" },

  langs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  lang: { flexGrow: 1, minWidth: 70, backgroundColor: c.surface, borderWidth: 2, borderColor: c.line, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  langActive: { borderColor: c.primary, backgroundColor: c.soft },
  langText: { color: c.text, fontWeight: "700" },

  scanner: { flex: 1, backgroundColor: c.text },
  scannerBar: { position: "absolute", left: 16, right: 16, bottom: 32, gap: 12 },
  scannerHint: { color: c.onPrimary, fontSize: 16, fontWeight: "600", textAlign: "center" },
});
