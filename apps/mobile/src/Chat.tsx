import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { brand, CHAT_MAX_LENGTH, t, type Language, type ProfileRow } from "@gp/shared";
import { loadChat, markChatRead, sendChat, type ChatEntry } from "./data";
import { feel } from "./ui";
import { styles } from "./styles";

const c = brand.colors;
const locales: Record<Language, string> = { de: "de-DE", en: "en-GB", ru: "ru-RU", uk: "uk-UA" };

/** Chat mit der Leitung (Büro, Vorarbeiter, Chef). Lädt alle paar Sekunden neu, solange er offen ist. */
export function Chat({ lang, profile, onRead }: { lang: Language; profile: ProfileRow; onRead: () => void }) {
  const [messages, setMessages] = useState<ChatEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const lastId = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await loadChat(profile.id);
      setFailed(false);
      const newest = list.at(-1)?.id ?? null;
      if (newest !== lastId.current) {
        lastId.current = newest;
        setMessages(list);
        await markChatRead(profile);
        onRead();
      } else setMessages((old) => old ?? list);
    } catch {
      setFailed(true);
    }
  }, [profile, onRead]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") load();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [load]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await sendChat(profile, text);
      setText("");
      feel.tap();
      await load();
    } catch {
      feel.warn();
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  let lastDay = "";
  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={scroll} contentContainerStyle={[styles.body, { gap: 6 }]} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        <Text style={styles.muted}>{t(lang, "chatHint")}</Text>
        {!messages && !failed && <ActivityIndicator color={c.primary} style={{ marginTop: 24 }} />}
        {messages?.length === 0 && <Text style={[styles.muted, { marginTop: 24, textAlign: "center" }]}>{t(lang, "chatEmpty")}</Text>}
        {messages?.map((m) => {
          const mine = m.author_id === profile.id;
          const at = new Date(m.created_at);
          const day = at.toLocaleDateString(locales[lang], { weekday: "long", day: "numeric", month: "long" });
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <View key={m.id} style={{ gap: 6 }}>
              {showDay && <Text style={[styles.muted, { textAlign: "center", fontSize: 12, marginTop: 8 }]}>{day}</Text>}
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                {!mine && <Text style={styles.bubbleAuthor}>{m.authorName ?? t(lang, "management")}</Text>}
                <Text style={[styles.bubbleText, mine && { color: c.onPrimary }]}>{m.body}</Text>
                <Text style={[styles.bubbleTime, mine && { color: c.onPrimary }]}>{at.toLocaleTimeString(locales[lang], { hour: "2-digit", minute: "2-digit" })}</Text>
              </View>
            </View>
          );
        })}
        {failed && <Text style={styles.error}>{t(lang, "offline")}</Text>}
      </ScrollView>
      <View style={styles.composer}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t(lang, "chatPlaceholder")}
          placeholderTextColor={c.muted}
          multiline
          numberOfLines={1}
          maxLength={CHAT_MAX_LENGTH}
          style={styles.composerInput}
          accessibilityLabel={t(lang, "chatPlaceholder")}
        />
        <Pressable
          onPress={send}
          disabled={!text.trim() || sending}
          style={[styles.sendButton, (!text.trim() || sending) && { opacity: 0.5 }]}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "send")}
        >
          {sending ? <ActivityIndicator color={c.onPrimary} /> : <Ionicons name="send" size={20} color={c.onPrimary} />}
        </Pressable>
      </View>
    </View>
  );
}
