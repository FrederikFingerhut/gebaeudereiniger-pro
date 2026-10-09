import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Image, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import { brand, isNetworkError, languages, t, type Language, type ProfileRow, type TextKey } from "@gp/shared";
import { supabase } from "./src/supabase";
import { chatUnreadCount, loadDay, loadMyReports, loadProfile, saveLanguage, unreadCount, type Day, type MyReport, type MyVisit } from "./src/data";
import { Absences, Messages, PushSwitch } from "./src/Extras";
import { Chat } from "./src/Chat";
import { registerServiceWorker } from "./src/push";
import { applyToDay, cachedDay, enqueue, flush, loadOutbox, perform, saveDay, type Action } from "./src/outbox";
import { VisitDetail, formatDuration } from "./src/VisitDetail";
import { Button, DoneOverlay, FadeIn, TabBar, feel } from "./src/ui";
import { styles } from "./src/styles";

const c = brand.colors;
const locales: Record<Language, string> = { de: "de-DE", en: "en-GB", ru: "ru-RU", uk: "uk-UA" };

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileRow | null | undefined>(undefined);
  const [lang, setLang] = useState<Language>("de");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    registerServiceWorker();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) {
      setProfile(undefined);
      return;
    }
    loadProfile(userId)
      .then((p) => {
        setProfile(p);
        if (p) setLang(p.language);
      })
      .catch(() => setNotice(t(lang, "networkError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const notify = useCallback((key: TextKey) => setNotice(t(lang, key)), [lang]);

  const changeLang = (l: Language) => {
    setLang(l);
    if (profile) saveLanguage(profile, l);
  };

  let content: React.ReactNode;
  if (session === undefined || (session && profile === undefined)) {
    content = <ActivityIndicator style={{ marginTop: 48 }} color={c.primary} />;
  } else if (!session) {
    content = <Login lang={lang} changeLang={changeLang} />;
  } else if (!profile || profile.role === "kunde") {
    content = (
      <View style={styles.body}>
        <Text style={styles.title}>{t(lang, profile ? "customerAccount" : "noProfile")}</Text>
        <LogoutButton lang={lang} />
      </View>
    );
  } else {
    content = <Home lang={lang} changeLang={changeLang} profile={profile} notify={notify} />;
  }

  const today = new Date().toLocaleDateString(locales[lang], { weekday: "long", day: "numeric", month: "long" });

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Image source={require("./assets/splash-icon.png")} style={styles.logo} accessibilityIgnoresInvertColors />
            <View style={{ flex: 1 }}>
              <Text style={styles.hello} numberOfLines={1}>
                {profile ? `${t(lang, "greeting")}, ${profile.full_name.split(" ")[0]}` : brand.name}
              </Text>
              {profile && <Text style={styles.date}>{today}</Text>}
            </View>
          </View>
        </View>

        <SafeAreaView style={styles.main} edges={["bottom"]}>
          {content}
          {notice && (
            <View style={styles.toast} pointerEvents="none">
              <Text style={styles.toastText}>{notice}</Text>
            </View>
          )}
        </SafeAreaView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Languages({ lang, changeLang }: { lang: Language; changeLang: (l: Language) => void }) {
  return (
    <View style={styles.langs}>
      {languages.map((l) => (
        <Pressable
          key={l.code}
          onPress={() => {
            feel.tap();
            changeLang(l.code);
          }}
          style={[styles.lang, lang === l.code && styles.langActive]}
          accessibilityRole="radio"
          accessibilityState={{ selected: lang === l.code }}
        >
          <Text style={styles.langText}>{l.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Login({ lang, changeLang }: { lang: Language; changeLang: (l: Language) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TextKey | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      feel.warn();
      setError(error.status === 400 ? "loginFailed" : "networkError");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Languages lang={lang} changeLang={changeLang} />
      <View style={styles.card}>
        <Text style={styles.label}>{t(lang, "email")}</Text>
        <TextInput style={styles.field} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
        <Text style={styles.label}>{t(lang, "password")}</Text>
        <TextInput style={styles.field} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={submit} />
        {error && <Text style={styles.error}>{t(lang, error)}</Text>}
        <Button label={t(lang, "login")} variant="primary" big onPress={submit} busy={busy} disabled={!email || !password} />
      </View>
    </ScrollView>
  );
}

function LogoutButton({ lang }: { lang: Language }) {
  return <Button label={t(lang, "logout")} icon="log-out-outline" onPress={() => supabase.auth.signOut()} />;
}

/**
 * Einsätze von heute mit Postausgang: Fehlt das Netz, wird die Aktion gespeichert,
 * sofort angezeigt und später gesendet.
 */
function useDay(profile: ProfileRow, notify: (key: TextKey) => void) {
  const [day, setDay] = useState<Day | null>(null);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const syncing = useRef(false);

  const show = useCallback(
    async (base: Day) => {
      const queued = await loadOutbox(profile.id);
      setPending(queued.length);
      const next = queued.reduce(applyToDay, base);
      setDay(next);
      return next;
    },
    [profile.id],
  );

  const reload = useCallback(async () => {
    try {
      const fresh = await loadDay(profile.id);
      await saveDay(profile.id, fresh);
      setOffline(false);
      await show(fresh);
    } catch (e) {
      const cached = await cachedDay(profile.id);
      if (isNetworkError(e as { message?: string })) setOffline(true);
      else notify("networkError");
      await show(cached ?? { visits: [], checklist: [], checked: {}, openEntry: null });
    }
  }, [profile.id, show, notify]);

  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const result = await flush(profile);
      setPending(result.left);
      if (result.sent || result.rejected.length) {
        await reload();
        if (result.rejected.length) {
          feel.warn();
          notify(result.rejected[0]);
        } else if (!result.left) notify("synced");
      } else if (result.left) setOffline(true);
    } finally {
      syncing.current = false;
    }
  }, [profile, reload, notify]);

  /** Führt eine Aktion aus; ohne Netz landet sie im Postausgang. Gibt "queued" zurück, wenn gespeichert. */
  const act = useCallback(
    async (action: Action): Promise<"done" | "queued"> => {
      const queueFirst = (await loadOutbox(profile.id)).length > 0;
      if (!queueFirst) {
        try {
          await perform(profile, action, false);
          if (action.type !== "check") await reload();
          return "done";
        } catch (e) {
          if (!isNetworkError(e as { message?: string })) throw e;
        }
      }
      // Ohne Netz (oder solange noch Älteres wartet): speichern und gleich anzeigen.
      const queued = await enqueue(profile.id, action);
      setPending(queued.length);
      setOffline(true);
      setDay((d) => {
        const next = d ? applyToDay(d, action) : d;
        if (next) saveDay(profile.id, next);
        return next;
      });
      if (queueFirst) sync();
      return "queued";
    },
    [profile, reload, sync],
  );

  useEffect(() => {
    reload().then(sync);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") sync().then(reload);
    });
    return () => sub.remove();
  }, [reload, sync]);

  // Solange etwas wartet, regelmäßig nachsenden.
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(sync, 20_000);
    return () => clearInterval(timer);
  }, [pending, sync]);

  // Im Browser meldet das Handy, wenn das Netz zurück ist.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [sync]);

  return { day, offline, pending, reload, act, setOffline };
}

type Tab = "today" | "chat" | "reports" | "messages" | "profile";

function Home({ lang, changeLang, profile, notify }: { lang: Language; changeLang: (l: Language) => void; profile: ProfileRow; notify: (key: TextKey) => void }) {
  const { day, offline, pending, reload, act } = useDay(profile, notify);
  const [tab, setTab] = useState<Tab>("today");
  const [openId, setOpenId] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [unread, setUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);

  // Ungelesene Nachrichten für das Zeichen am Reiter, beim Öffnen der App und jede Minute.
  const countUnread = useCallback(() => {
    unreadCount(profile.id).then(setUnread).catch(() => {});
    chatUnreadCount(profile.id).then(setChatUnread).catch(() => {});
  }, [profile.id]);
  const chatRead = useCallback(() => setChatUnread(0), []);
  useEffect(() => {
    countUnread();
    const timer = setInterval(countUnread, 60_000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") countUnread();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [countUnread]);
  const markedRead = useCallback(() => {
    setUnread(0);
    reload();
  }, [reload]);

  const open = day?.visits.find((v) => v.id === openId);

  let screen: React.ReactNode;
  if (!day) screen = <ActivityIndicator style={{ marginTop: 48 }} color={c.primary} />;
  else if (tab === "today" && open)
    screen = (
      <FadeIn key={open.id}>
        <VisitDetail
          lang={lang}
          visit={open}
          day={day}
          act={act}
          onBack={() => setOpenId(null)}
          onFinished={() => {
            setOpenId(null);
            setCelebrate(true);
          }}
          notify={notify}
        />
      </FadeIn>
    );
  else if (tab === "today")
    screen = (
      <FadeIn key="today">
        <Today lang={lang} day={day} onOpen={setOpenId} reload={reload} />
      </FadeIn>
    );
  else if (tab === "chat")
    screen = (
      <FadeIn key="chat">
        <Chat lang={lang} profile={profile} onRead={chatRead} />
      </FadeIn>
    );
  else if (tab === "reports")
    screen = (
      <FadeIn key="reports">
        <Reports lang={lang} profile={profile} pending={pending} />
      </FadeIn>
    );
  else if (tab === "messages")
    screen = (
      <FadeIn key="messages">
        <Messages lang={lang} profile={profile} onRead={markedRead} />
      </FadeIn>
    );
  else
    screen = (
      <FadeIn key="profile">
        <Profile lang={lang} changeLang={changeLang} profile={profile} notify={notify} />
      </FadeIn>
    );

  return (
    <View style={{ flex: 1 }}>
      {(offline || pending > 0) && (
        <View style={styles.offlineBar} accessibilityLiveRegion="polite">
          <Ionicons name="cloud-offline-outline" size={18} color={c.onSignal} />
          <Text style={styles.offlineText}>{offline ? t(lang, "offline") : `${t(lang, "pending")}: ${pending}`}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>{screen}</View>
      <TabBar<Tab>
        active={tab}
        onChange={(next) => {
          if (next === tab) setOpenId(null);
          setTab(next);
        }}
        tabs={[
          { key: "today", label: t(lang, "tabToday"), icon: "today-outline" },
          { key: "chat", label: t(lang, "tabChat"), icon: "chatbubbles-outline", badge: tab === "chat" ? 0 : chatUnread },
          { key: "reports", label: t(lang, "tabReports"), icon: "megaphone-outline" },
          { key: "messages", label: t(lang, "tabNews"), icon: "notifications-outline", badge: unread },
          { key: "profile", label: t(lang, "tabProfile"), icon: "person-circle-outline" },
        ]}
      />
      {celebrate && <DoneOverlay title={t(lang, "wellDone")} subtitle={t(lang, "visitDone")} onDone={() => setCelebrate(false)} />}
    </View>
  );
}

function Today({ lang, day, onOpen, reload }: { lang: Language; day: Day; onOpen: (id: string) => void; reload: () => Promise<void> }) {
  const [refreshing, setRefreshing] = useState(false);
  const running = day.visits.find((v) => v.id === day.openEntry?.visit_id);
  const rest = day.visits.filter((v) => v !== running);
  const nextId = rest.find((v) => v.status !== "erledigt")?.id;

  return (
    <ScrollView
      contentContainerStyle={styles.body}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await reload();
            setRefreshing(false);
          }}
        />
      }
    >
      {running && day.openEntry && <RunningCard lang={lang} visit={running} since={day.openEntry.clock_in_at} onPress={() => onOpen(running.id)} />}
      <Text style={styles.label}>{t(lang, "myVisits")}</Text>
      {day.visits.length === 0 && (
        <View style={[styles.card, { alignItems: "center", paddingVertical: 28 }]}>
          <Ionicons name="sunny-outline" size={36} color={c.muted} />
          <Text style={styles.muted}>{t(lang, "noVisits")}</Text>
        </View>
      )}
      {rest.map((v) => {
        const done = v.status === "erledigt";
        const tone = done ? c.ok : v.id === nextId ? c.primary : c.muted;
        return (
          <Pressable
            key={v.id}
            style={({ pressed }) => [styles.job, done && styles.jobDone, pressed && { transform: [{ scale: 0.98 }] }]}
            onPress={() => {
              feel.tap();
              onOpen(v.id);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.jobTime}>{v.startTime}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.jobName}>{v.site.name}</Text>
              <Text style={styles.muted} numberOfLines={1}>
                {v.site.address}
              </Text>
              <Text style={[styles.pill, { color: tone, backgroundColor: c.soft }]}>
                {done ? `✓ ${t(lang, "done")}` : v.id === nextId ? t(lang, "nextVisit") : t(lang, "open")}
              </Text>
            </View>
            <Ionicons name={done ? "checkmark-circle" : "chevron-forward"} size={24} color={done ? c.ok : c.muted} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function RunningCard({ lang, visit, since, onPress }: { lang: Language; visit: MyVisit; since: string; onPress: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <Pressable style={({ pressed }) => [styles.hero, pressed && { transform: [{ scale: 0.98 }] }]} onPress={onPress} accessibilityRole="button">
      <Text style={styles.heroLabel}>{t(lang, "runningFor")}</Text>
      <Text style={styles.heroTime}>{formatDuration(now - new Date(since).getTime())}</Text>
      <View style={[styles.buttonRow, { justifyContent: "space-between" }]}>
        <Text style={styles.heroTitle}>{visit.site.name}</Text>
        <Ionicons name="chevron-forward" size={24} color={c.onPrimary} />
      </View>
    </Pressable>
  );
}

function Reports({ lang, profile, pending }: { lang: Language; profile: ProfileRow; pending: number }) {
  const [reports, setReports] = useState<MyReport[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setReports(await loadMyReports(profile.id));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [profile.id]);

  useEffect(() => {
    load();
  }, [load, pending]);

  const kindLabel = (kind: MyReport["kind"]) => (kind === "material" ? t(lang, "kindMaterial") : t(lang, "kindProblem"));

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
      <Text style={styles.label}>{t(lang, "myReports")}</Text>
      {!reports && !failed && <ActivityIndicator color={c.primary} />}
      {failed && !reports && <Text style={styles.muted}>{t(lang, "offline")}</Text>}
      {reports?.length === 0 && <Text style={styles.muted}>{t(lang, "noReports")}</Text>}
      {reports?.map((r) => (
        <View key={r.id} style={styles.card}>
          <View style={[styles.buttonRow, { justifyContent: "space-between" }]}>
            <Text style={styles.jobName}>{r.siteName || kindLabel(r.kind)}</Text>
            <Text style={[styles.pill, { marginTop: 0, color: r.status === "erledigt" ? c.ok : c.warn, backgroundColor: c.soft }]}>
              {r.status === "erledigt" ? `✓ ${t(lang, "done")}` : t(lang, "open")}
            </Text>
          </View>
          <Text style={styles.muted}>
            {kindLabel(r.kind)} · {new Date(r.created_at).toLocaleString(locales[lang], { dateStyle: "short", timeStyle: "short" })}
            {r.photoCount > 0 ? ` · 📷 ${r.photoCount}` : ""}
          </Text>
          {!!r.text && <Text style={{ color: c.text, fontSize: 15 }}>{r.text}</Text>}
        </View>
      ))}
    </ScrollView>
  );
}

function Profile({ lang, changeLang, profile, notify }: { lang: Language; changeLang: (l: Language) => void; profile: ProfileRow; notify: (key: TextKey) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={[styles.card, styles.buttonRow]}>
        <Ionicons name="person-circle-outline" size={40} color={c.primary} />
        <Text style={styles.jobName}>{profile.full_name}</Text>
      </View>
      <Text style={styles.label}>{t(lang, "language")}</Text>
      <Languages lang={lang} changeLang={changeLang} />
      <Absences lang={lang} profile={profile} notify={notify} />
      <Text style={styles.label}>{t(lang, "notifications")}</Text>
      <PushSwitch lang={lang} />
      <Text style={styles.label}> </Text>
      <LogoutButton lang={lang} />
    </ScrollView>
  );
}
