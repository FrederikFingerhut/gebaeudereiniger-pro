import { NextResponse, type NextRequest } from "next/server";
import { berlinDate, hoursCsv } from "@gp/shared";
import { loadMonthHours, periodFrom } from "@/lib/hours";
import { requireMe } from "@/lib/supabase";

// Download der Monatsübersicht als CSV (öffnet sich direkt in Excel).
export async function GET(request: NextRequest) {
  const { supabase, isOffice } = await requireMe();
  if (!isOffice) return new NextResponse("Keine Berechtigung", { status: 403 });
  const period = periodFrom(request.nextUrl.searchParams.get("monat"), berlinDate().slice(0, 7));
  const { employees, employeeName, siteName } = await loadMonthHours(supabase, period);
  const csv = hoursCsv(period, employees, { employee: employeeName, site: siteName });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="stunden-${period}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
