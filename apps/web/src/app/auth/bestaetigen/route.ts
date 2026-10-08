import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { db } from "@/lib/supabase";

// Ziel der Links aus den Mails (Vorlagen in Supabase: ?token_hash=…&type=…).
// Ältere Passwort-Links tragen stattdessen ?code=… (nur im gleichen Browser gültig).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const url = request.nextUrl.clone();
  url.search = "";

  const supabase = await db();
  let ok = false;
  // Nach Einladung oder „Passwort vergessen“ ein Passwort setzen, sonst direkt zur Übersicht.
  let next = "/passwort-neu";
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
    if (type !== "recovery" && type !== "invite") next = "/";
  }
  // Abgelaufen oder schon benutzt: neuen Link anfordern.
  url.pathname = ok ? next : "/passwort-vergessen";
  return NextResponse.redirect(url);
}
