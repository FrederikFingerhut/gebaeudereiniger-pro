import { useEffect, useRef, type ReactNode } from "react";
import { ActivityIndicator, Animated, Easing, Platform, Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { brand } from "@gp/shared";
import { styles } from "./styles";

const c = brand.colors;
const native = Platform.OS !== "web";

// Kurzes Vibrieren als Rückmeldung. Im Browser über navigator.vibrate (Android).
export const feel = {
  tap: () => (native ? Haptics.selectionAsync().catch(() => {}) : vibrate(8)),
  success: () => (native ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}) : vibrate([20, 60, 30])),
  warn: () => (native ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}) : vibrate(40)),
};

function vibrate(pattern: number | number[]) {
  try {
    (globalThis.navigator as Navigator | undefined)?.vibrate?.(pattern);
  } catch {
    // Nicht jedes Gerät kann vibrieren.
  }
}

export type IconName = keyof typeof Ionicons.glyphMap;

type Variant = "primary" | "signal" | "ghost";
const variantStyle = { primary: styles.primary, signal: styles.signal, ghost: styles.ghost };
const variantText = { primary: styles.primaryText, signal: styles.signalText, ghost: styles.ghostText };
const variantColor = { primary: c.onPrimary, signal: c.onSignal, ghost: c.text };

/** Knopf mit sichtbarer Rückmeldung beim Drücken (leicht kleiner) und Vibration. */
export function Button({
  label,
  onPress,
  variant = "ghost",
  icon,
  big,
  busy,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  big?: boolean;
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      disabled={off}
      onPress={() => {
        feel.tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        variantStyle[variant],
        big && styles.big,
        off && { opacity: 0.5 },
        pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variantColor[variant]} />
      ) : (
        <View style={styles.buttonRow}>
          {icon && <Ionicons name={icon} size={big ? 24 : 20} color={variantColor[variant]} />}
          <Text style={variantText[variant]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Blendet Inhalt sanft ein (beim Wechsel zwischen Seiten). */
export function FadeIn({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
  }, [progress]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  return <Animated.View style={[{ flex: 1, opacity: progress, transform: [{ translateY }] }, style]}>{children}</Animated.View>;
}

/** Großer grüner Haken nach dem Ausstempeln. */
export function DoneOverlay({ title, subtitle, onDone }: { title: string; subtitle: string; onDone: () => void }) {
  const scale = useRef(new Animated.Value(0.4)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    feel.success();
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: native }),
      Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: native }),
    ]).start();
    const timer = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: native }).start(onDone);
    }, 1500);
    return () => clearTimeout(timer);
  }, [scale, fade, onDone]);
  return (
    <Animated.View style={[styles.overlay, { opacity: fade }]} pointerEvents="none">
      <Animated.View style={[styles.doneCircle, { transform: [{ scale }] }]}>
        <Ionicons name="checkmark" size={72} color={c.onPrimary} />
      </Animated.View>
      <Text style={styles.doneTitle}>{title}</Text>
      <Text style={styles.doneSubtitle}>{subtitle}</Text>
    </Animated.View>
  );
}

/** Leiste unten mit großen Feldern für den Daumen. */
export function TabBar<T extends string>({ tabs, active, onChange }: { tabs: { key: T; label: string; icon: IconName; badge?: number }[]; active: T; onChange: (key: T) => void }) {
  return (
    <View style={styles.tabBar} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) feel.tap();
              onChange(tab.key);
            }}
          >
            <View style={[styles.tabIcon, on && styles.tabIconOn]}>
              <Ionicons name={tab.icon} size={24} color={on ? c.primary : c.muted} />
              {!!tab.badge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{tab.badge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
