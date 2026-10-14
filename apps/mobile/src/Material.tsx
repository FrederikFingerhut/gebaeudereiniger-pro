import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { brand, t, type Language, type TextKey } from "@gp/shared";
import { loadMaterial, setMaterialStatus, type MaterialItem, type MaterialStatus } from "./data";
import { feel } from "./ui";
import { styles } from "./styles";

const c = brand.colors;
const options: { status: MaterialStatus; label: TextKey; color: string }[] = [
  { status: "ok", label: "materialOk", color: c.ok },
  { status: "wenig", label: "materialLow", color: c.warn },
  { status: "fehlt", label: "materialMissing", color: c.bad },
];

/** Material-Checkliste im Einsatz: Das Büro legt sie je Objekt an, der Mitarbeiter meldet den Stand. */
export function Material({ lang, siteId, notify }: { lang: Language; siteId: string; notify: (key: TextKey) => void }) {
  const [items, setItems] = useState<MaterialItem[]>([]);

  useEffect(() => {
    loadMaterial(siteId).then(setItems).catch(() => {});
  }, [siteId]);

  if (items.length === 0) return null;

  const set = async (item: MaterialItem, status: MaterialStatus) => {
    if (item.status === status) return;
    feel.tap();
    const before = item.status;
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, status } : i)));
    try {
      await setMaterialStatus(item.id, status);
    } catch {
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, status: before } : i)));
      notify("networkError");
    }
  };

  return (
    <>
      <Text style={styles.label}>{t(lang, "materialTitle")}</Text>
      <Text style={[styles.muted, { marginTop: -4 }]}>{t(lang, "materialHint")}</Text>
      {items.map((item) => (
        <View key={item.id} style={[styles.card, { gap: 8 }]}>
          <Text style={styles.jobName}>{item.name}</Text>
          <View style={styles.row}>
            {options.map((o) => {
              const on = item.status === o.status;
              return (
                <Pressable
                  key={o.status}
                  style={[styles.chip, { paddingVertical: 8 }, on && { borderColor: o.color, backgroundColor: c.soft }]}
                  onPress={() => set(item, o.status)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${item.name}: ${t(lang, o.label)}`}
                >
                  <Text style={[styles.chipText, { fontSize: 14 }, on && { color: o.color }]}>{t(lang, o.label)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </>
  );
}
