import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { brand, checklistTitle, t, type Language, type ProfileRow, type TextKey } from "@gp/shared";
import { clockIn, clockOut, errorText, sendReport, setChecked, tokenFromQr, type Day, type MyVisit, type ReportKind, type ReportPhoto } from "./data";
import { styles } from "./styles";

const c = brand.colors;

function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

interface Props {
  lang: Language;
  profile: ProfileRow;
  visit: MyVisit;
  day: Day;
  onBack: () => void;
  onChanged: () => Promise<void>;
  notify: (key: TextKey) => void;
}

export function VisitDetail({ lang, profile, visit, day, onBack, onChanged, notify }: Props) {
  const entry = day.openEntry?.visit_id === visit.id ? day.openEntry : null;
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TextKey | null>(null);
  const [scanning, setScanning] = useState(false);
  const [checked, setCheckedState] = useState<Set<string>>(new Set(day.checked[visit.id] ?? []));
  const [reporting, setReporting] = useState(false);
  const items = day.checklist.filter((i) => i.site_id === visit.siteId);
  const done = visit.status === "erledigt";

  useEffect(() => {
    if (!entry) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [entry]);

  const run = async (action: () => Promise<unknown>, success?: TextKey) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
      if (success) notify(success);
      return true;
    } catch (e) {
      setError(errorText(e as { message?: string }));
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Einstempeln per GPS: Standort holen, die Datenbank prüft den Abstand zum Objekt.
  const clockInGps = () =>
    run(async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw { message: "standort_fehlt" };
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await clockIn(visit.id, { latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    });

  const clockInQr = (data: string) => {
    setScanning(false);
    run(() => clockIn(visit.id, { token: tokenFromQr(data) }));
  };

  const finish = async () => {
    if (await run(() => clockOut(entry!.id), "clockedOut")) onBack();
  };

  const toggle = async (itemId: string) => {
    const on = !checked.has(itemId);
    setCheckedState((prev) => {
      const next = new Set(prev);
      if (on) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
    try {
      await setChecked(profile, visit.id, itemId, on);
    } catch {
      notify("networkError");
    }
  };

  if (scanning) return <QrScanner lang={lang} onScan={clockInQr} onCancel={() => setScanning(false)} />;

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Pressable onPress={onBack} accessibilityRole="button">
        <Text style={styles.back}>‹ {t(lang, "back")}</Text>
      </Pressable>
      <View>
        <Text style={styles.title}>{visit.site.name}</Text>
        <Text style={styles.muted}>
          {visit.startTime} · {visit.site.address}
        </Text>
      </View>

      {!done && (
        <View style={styles.clock}>
          {entry && (
            <>
              <Text style={styles.label}>{t(lang, "runningFor")}</Text>
              <Text style={styles.clockTime}>{formatDuration(now - new Date(entry.clock_in_at).getTime())}</Text>
            </>
          )}
          {busy ? (
            <>
              <ActivityIndicator color={c.primary} />
              {!entry && <Text style={styles.muted}>{t(lang, "locating")}</Text>}
            </>
          ) : entry ? (
            <Pressable style={[styles.button, styles.big, styles.primary]} onPress={finish}>
              <Text style={styles.primaryText}>{t(lang, "clockOut")}</Text>
            </Pressable>
          ) : (
            <>
              <Pressable style={[styles.button, styles.big, styles.signal]} onPress={clockInGps}>
                <Text style={styles.signalText}>{t(lang, "clockIn")}</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.big, styles.ghost]} onPress={() => setScanning(true)}>
                <Text style={styles.ghostText}>{t(lang, "scanQr")}</Text>
              </Pressable>
            </>
          )}
          {error && <Text style={[styles.error, { textAlign: "center" }]}>{t(lang, error)}</Text>}
        </View>
      )}

      {items.length > 0 && (
        <Text style={styles.label}>
          {t(lang, "checklist")} · {checked.size}/{items.length}
        </Text>
      )}
      {items.map((item) => {
        const on = checked.has(item.id);
        return (
          <Pressable key={item.id} style={styles.check} onPress={() => toggle(item.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
            <View style={[styles.box, on && styles.boxOn]}>{on && <Text style={styles.boxMark}>✓</Text>}</View>
            <Text style={[styles.checkText, on && styles.checkTextOn]}>{checklistTitle(item.title, lang)}</Text>
          </Pressable>
        );
      })}

      {reporting ? (
        <ReportForm
          lang={lang}
          onSend={async (kind, text, photos) => {
            try {
              await sendReport(profile, visit, kind, text, photos);
              setReporting(false);
              notify("reportSent");
            } catch {
              notify("networkError");
            }
          }}
        />
      ) : (
        <Pressable style={[styles.button, styles.ghost]} onPress={() => setReporting(true)}>
          <Text style={styles.ghostText}>{t(lang, "reportProblem")}</Text>
        </Pressable>
      )}

      {(visit.site.accessNotes || visit.site.contact || visit.site.specialNotes) && <Text style={styles.label}>{t(lang, "siteInfo")}</Text>}
      <View style={styles.info}>
        {visit.site.accessNotes && <InfoRow label={t(lang, "access")} value={visit.site.accessNotes} />}
        {visit.site.contact && <InfoRow label={t(lang, "contact")} value={visit.site.contact} />}
        {visit.site.specialNotes && <InfoRow label={t(lang, "special")} value={visit.site.specialNotes} />}
      </View>
    </ScrollView>
  );
}

const MAX_PHOTOS = 3;

// Meldung ans Büro: Art, kurzer Text und bis zu drei Fotos.
function ReportForm({ lang, onSend }: { lang: Language; onSend: (kind: ReportKind, text: string, photos: ReportPhoto[]) => Promise<void> }) {
  const [kind, setKind] = useState<ReportKind>("problem");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);
  const [sending, setSending] = useState(false);
  const [denied, setDenied] = useState(false);

  const addPhoto = async (source: "camera" | "library") => {
    const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setDenied(true);
    setDenied(false);
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.8 };
    const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    setPhotos((prev) => [...prev, ...result.assets.map((a) => ({ uri: a.uri, width: a.width }))].slice(0, MAX_PHOTOS));
  };

  const send = async () => {
    setSending(true);
    await onSend(kind, text.trim(), photos);
    setSending(false);
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.row}>
        {(["problem", "material"] as const).map((k) => (
          <Pressable key={k} style={[styles.chip, kind === k && styles.chipOn]} onPress={() => setKind(k)} accessibilityRole="radio" accessibilityState={{ selected: kind === k }}>
            <Text style={styles.chipText}>{t(lang, k === "problem" ? "kindProblem" : "kindMaterial")}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput style={styles.input} multiline placeholder={t(lang, "problemPlaceholder")} value={text} onChangeText={setText} />
      {photos.length > 0 && (
        <View style={styles.row}>
          {photos.map((p, i) => (
            <View key={p.uri}>
              <Image source={{ uri: p.uri }} style={styles.thumb} />
              <Pressable style={styles.thumbRemove} onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))} accessibilityLabel="✕">
                <Text style={styles.thumbRemoveText}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {photos.length < MAX_PHOTOS && (
        <View style={styles.row}>
          <Pressable style={[styles.button, styles.ghost, { flex: 1 }]} onPress={() => addPhoto("camera")}>
            <Text style={styles.ghostText}>📷 {t(lang, "takePhoto")}</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.ghost, { flex: 1 }]} onPress={() => addPhoto("library")}>
            <Text style={styles.ghostText}>{t(lang, "pickPhoto")}</Text>
          </Pressable>
        </View>
      )}
      {denied && <Text style={styles.error}>{t(lang, "photoDenied")}</Text>}
      <Pressable style={[styles.button, styles.primary, (sending || (!text.trim() && photos.length === 0)) && { opacity: 0.5 }]} disabled={sending || (!text.trim() && photos.length === 0)} onPress={send}>
        <Text style={styles.primaryText}>{t(lang, sending ? "sending" : "send")}</Text>
      </Pressable>
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
                  onScan(result.data);
                }
          }
        />
      )}
      <View style={styles.scannerBar}>
        <Text style={styles.scannerHint}>{permission && !permission.granted && !permission.canAskAgain ? t(lang, "cameraDenied") : t(lang, "scanHint")}</Text>
        <Pressable style={[styles.button, styles.ghost]} onPress={onCancel}>
          <Text style={styles.ghostText}>{t(lang, "cancel")}</Text>
        </Pressable>
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
