import { NextResponse, type NextRequest } from "next/server";
import { requireMe } from "@/lib/supabase";

// Öffnet eine Datei aus dem Kunden-Ordner über einen kurz gültigen Link.
export async function GET(_: NextRequest, { params }: RouteContext<"/kunden/datei/[id]">) {
  const { id } = await params;
  const { supabase, isOffice } = await requireMe();
  if (!isOffice) return new NextResponse("Keine Berechtigung", { status: 403 });
  const { data: file } = await supabase.from("customer_files").select("path").eq("id", id).maybeSingle();
  if (!file) return new NextResponse("Nicht gefunden", { status: 404 });
  const { data } = await supabase.storage.from("dokumente").createSignedUrl(file.path, 120);
  if (!data) return new NextResponse("Nicht gefunden", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
