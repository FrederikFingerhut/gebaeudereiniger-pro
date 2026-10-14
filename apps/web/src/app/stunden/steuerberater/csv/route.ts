import { NextResponse, type NextRequest } from "next/server";
import { berlinDate, payrollCsv } from "@gp/shared";
import { loadPayroll } from "@/lib/account";
import { periodFrom } from "@/lib/hours";
import { requireMe } from "@/lib/supabase";

// Monatsliste für den Steuerberater als CSV (öffnet sich direkt in Excel).
export async function GET(request: NextRequest) {
  const { supabase, isOffice } = await requireMe();
  if (!isOffice) return new NextResponse("Keine Berechtigung", { status: 403 });
  const period = periodFrom(request.nextUrl.searchParams.get("monat"), berlinDate().slice(0, 7));
  const csv = payrollCsv(period, await loadPayroll(supabase, period));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lohnliste-${period}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
