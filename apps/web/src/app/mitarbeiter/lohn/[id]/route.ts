import { NextResponse, type NextRequest } from "next/server";
import { requireMe } from "@/lib/supabase";

// Öffnet eine Lohnabrechnung über einen kurz gültigen Link (Speicher ist privat).
export async function GET(_: NextRequest, { params }: RouteContext<"/mitarbeiter/lohn/[id]">) {
  const { id } = await params;
  const { supabase, isOffice } = await requireMe();
  if (!isOffice) return new NextResponse("Keine Berechtigung", { status: 403 });
  const { data: slip } = await supabase.from("payslips").select("path").eq("id", id).maybeSingle();
  if (!slip) return new NextResponse("Nicht gefunden", { status: 404 });
  const { data } = await supabase.storage.from("dokumente").createSignedUrl(slip.path, 60);
  if (!data) return new NextResponse("Nicht gefunden", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
