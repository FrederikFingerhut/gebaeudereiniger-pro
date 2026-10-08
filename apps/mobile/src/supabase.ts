import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@gp/shared";

// Verbindung zur Datenbank. Die Anmeldung bleibt auf dem Handy gespeichert,
// damit Mitarbeiter sich nur einmal anmelden müssen.
export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || supabaseConfig.url,
  process.env.EXPO_PUBLIC_SUPABASE_KEY || supabaseConfig.publishableKey,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Anmeldung nur auffrischen, solange die App im Vordergrund ist.
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
