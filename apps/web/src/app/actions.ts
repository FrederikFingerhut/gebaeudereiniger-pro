"use server";

import { refresh } from "next/cache";
import { requireMe } from "@/lib/supabase";

export async function markReportDone(id: string) {
  const { supabase } = await requireMe();
  await supabase.from("reports").update({ status: "erledigt" }).eq("id", id);
  refresh();
}
