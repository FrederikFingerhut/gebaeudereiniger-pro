import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import { brand, languages, t, type Language, type ProfileRow, type TextKey } from "@gp/shared";
import { supabase } from "./src/supabase";
import { errorText, loadDay, loadProfile, reportSick, saveLanguage, type Day } from "./src/data";
import { VisitDetail } from "./src/VisitDetail";
import { styles } from "./src/styles";

const c = brand.colors;

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileRow | null | undefined>(undefined);
  const [lang, setLang] = useState<Language>("de");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
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
    content = <Login lang={lang} />;
  } else if (!profile) {
    content = (
      <View style={styles.body}>
        <Text style={styles.title}>{t(lang, "noProfile")}</Text>
        <LogoutButton lang={lang} />
      </View>
    );
  } else {
    content = <Home lang={lang} profile={profile} notify={notify} />;
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <View style={styles.langs}>
            {languages.map((l) => (
              <Pressable key={l.code} onPress={() => changeLang(l.code)} style={[styles.lang, lang === l.code && styles.langActive]} accessibilityLabel={l.label}>
                <Text style={[styles.langText, lang === l.code && styles.langTextActive]}>{l.code.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.titleRow}>
            <Image source={require("./assets/splash-icon.png")} style={styles.logo} accessibilityIgnoresInvertColors />
            <Text style={styles.hello}>{profile ? `${t(lang, "greeting")}, ${profile.full_name.split(" ")[0]}` : brand.name}</Text>
          </View>
        </View>

        {content}

        {notice && (
          <View style={styles.toast}>
            <Text style={styles.toastText}>{notice}</Text>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Login({ lang }: { lang: Language }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TextKey | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.status === 400 ? "loginFailed" : "networkError");
  };

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>{t(lang, "email")}</Text>
      <TextInput style={styles.field} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
      <Text style={styles.label}>{t(lang, "password")}</Text>
      <TextInput style={styles.field} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={submit} />
      {error && <Text style={styles.error}>{t(lang, error)}</Text>}
      <Pressable style={[styles.button, styles.primary]} onPress={submit} disabled={busy || !email || !password}>
        {busy ? <ActivityIndicator color={c.onPrimary} /> : <Text style={styles.primaryText}>{t(lang, "login")}</Text>}
      </Pressable>
    </ScrollView>
  );
}

function LogoutButton({ lang }: { lang: Language }) {
  return (
    <Pressable style={[styles.button, styles.ghost]} onPress={() => supabase.auth.signOut()}>
      <Text style={styles.ghostText}>{t(lang, "logout")}</Text>
    </Pressable>
  );
}

function Home({ lang, profile, notify }: { lang: Language; profile: ProfileRow; notify: (key: TextKey) => void }) {
  const [day, setDay] = useState<Day | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    try {
      setDay(await loadDay(profile.id));
    } catch {
      notify("networkError");
    }
  }, [profile.id, notify]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!day) return <ActivityIndicator style={{ marginTop: 48 }} color={c.primary} />;

  const open = day.visits.find((v) => v.id === openId);
  if (open) {
    return (
      <VisitDetail
        lang={lang}
        profile={profile}
        visit={open}
        day={day}
        onBack={() => setOpenId(null)}
        onChanged={reload}
        notify={notify}
      />
    );
  }

  const sick = () =>
    Alert.alert(t(lang, "reportSick"), t(lang, "sickQuestion"), [
      { text: t(lang, "no"), style: "cancel" },
      {
        text: t(lang, "yes"),
        onPress: () =>
          reportSick(profile)
            .then(() => notify("sickSent"))
            .catch((e) => notify(errorText(e))),
      },
    ]);

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
      <Text style={styles.label}>{t(lang, "myVisits")}</Text>
      {day.visits.length === 0 && <Text style={styles.muted}>{t(lang, "noVisits")}</Text>}
      {day.visits.map((v) => {
        const done = v.status === "erledigt";
        const running = day.openEntry?.visit_id === v.id;
        return (
          <Pressable key={v.id} style={styles.job} onPress={() => setOpenId(v.id)}>
            <Text style={styles.jobTime}>{v.startTime}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.jobName}>{v.site.name}</Text>
              <Text style={styles.muted}>{v.site.address}</Text>
              <Text style={[styles.pill, { color: done ? c.ok : running ? c.warn : c.muted }]}>
                {running ? t(lang, "runningFor") + " …" : t(lang, done ? "done" : "open")}
              </Text>
            </View>
          </Pressable>
        );
      })}
      <Pressable style={[styles.button, styles.ghost]} onPress={sick}>
        <Text style={styles.ghostText}>{t(lang, "reportSick")}</Text>
      </Pressable>
      <LogoutButton lang={lang} />
    </ScrollView>
  );
}
