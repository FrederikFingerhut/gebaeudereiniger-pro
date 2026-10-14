"use server";

import { refresh } from "next/cache";
import { requireMe } from "@/lib/supabase";

/** Tausch bestätigen (Einsatz wechselt den Mitarbeiter) oder ablehnen. */
export async function decideSwap(swapId: string, approve: boolean) {
  const { supabase } = await requireMe();
  await supabase.rpc("decide_swap", { p_swap: swapId, p_approve: approve });
  refresh();
}
