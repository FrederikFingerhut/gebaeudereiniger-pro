import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { db } from "@/lib/supabase";

// Ziel des Links aus der Passwort-Mail. Supabase hängt ?code=… an (gleicher
// Browser wie die Anfrage); mit eigenen Mail-Vorlagen geht auch ?token_hash=…&type=….
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const url = request.nextUrl.clone();
  url.search = "";

  const supabase = await db();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }
  // Abgelaufen, schon benutzt oder anderer Browser: neuen Link anfordern.
  url.pathname = ok ? "/passwort-neu" : "/passwort-vergessen";
  return NextResponse.redirect(url);
}
