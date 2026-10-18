import { NextResponse, type NextRequest } from "next/server";
import { requireMe } from "@/lib/supabase";

// Öffnet ein Foto der Krankmeldung über einen kurz gültigen Link (Speicher ist privat).
// Gesundheitsdaten: nur Büro und Chef.
export async function GET(_: NextRequest, { params }: RouteContext<"/mitarbeiter/krankmeldung/[id]/[n]">) {
  const { id, n } = await params;
  const { supabase, isOffice } = await requireMe();
  if (!isOffice) return new NextResponse("Keine Berechtigung", { status: 403 });
  const { data: absence } = await supabase.from("absences").select("attachment_paths").eq("id", id).maybeSingle();
  const path = (absence?.attachment_paths as string[] | undefined)?.[Number(n)];
  if (!path) return new NextResponse("Nicht gefunden", { status: 404 });
  const { data } = await supabase.storage.from("dokumente").createSignedUrl(path, 60);
  if (!data) return new NextResponse("Nicht gefunden", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
