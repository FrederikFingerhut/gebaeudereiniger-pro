import { Suspense } from "react";
import Link from "next/link";
import { berlinDate, inspectionScore, parseInspectionItems, scoreTone } from "@gp/shared";
import { Card, PageTitle, Pill } from "@/components/ui";
import { Skeleton } from "@/components/skeleton";
import { requireCustomer } from "@/lib/supabase";
import { one } from "@/lib/format";
import { ComplaintForm } from "./complaint-form";
import { PortalHeader } from "./header";

const date = (iso: string) => iso.split("-").reverse().join(".");
const weekday = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short" });

export default function PortalPage() {
  return (
    <Suspense fallback={<Skeleton rows={6} />}>
      <Portal />
    </Suspense>
  );
}

async function Portal() {
  const { supabase, profile, userId, customerId } = await requireCustomer();
  const today = berlinDate();
  const [{ data: company }, { data: customer }, { data: sites }, { data: done }, { data: planned }, { data: inspections }, { data: complaints }] = await Promise.all([
    supabase.from("companies").select("name, phone, email").eq("id", profile.company_id).single(),
    supabase.from("customers").select("name").eq("id", customerId).maybeSingle(),
    supabase.from("sites").select("id, name, address").eq("active", true).order("name"),
    supabase.from("visits").select("id, site_id, date, start_time").eq("status", "erledigt").lte("date", today).order("date", { ascending: false }).limit(60),
    supabase.from("visits").select("id, site_id, date, start_time").eq("status", "geplant").gte("date", today).order("date").order("start_time").limit(60),
    supabase.from("inspections").select("id, date, items, sites(name)").order("date", { ascending: false }).limit(20),
    supabase.from("reports").select("id, text, status, created_at, sites(name)").eq("author_id", userId).order("created_at", { ascending: false }).limit(20),
  ]);

  return (
    <div className="max-w-4xl">
      <PortalHeader company={company?.name ?? ""} />
      <PageTitle note={`Hallo ${profile.full_name}. Hier sehen Sie, wann bei ${customer?.name ?? "Ihnen"} gereinigt wurde und wird.`}>Ihre Reinigung</PageTitle>

      <div className="flex flex-col gap-4">
        {(sites ?? []).length === 0 && <Card title="Noch keine Objekte"><p className="text-sm">Für Ihren Zugang sind noch keine Objekte hinterlegt.</p></Card>}
        {(sites ?? []).map((site) => {
          const last = (done ?? []).filter((v) => v.site_id === site.id).slice(0, 5);
          const next = (planned ?? []).filter((v) => v.site_id === site.id).slice(0, 5);
          return (
            <Card key={site.id} title={site.name}>
              <p className="text-sm text-muted -mt-2 mb-3">{site.address}</p>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <h3 className="font-semibold mb-1">Zuletzt gereinigt</h3>
                  {last.length === 0 ? <p className="text-muted">Noch keine erledigten Reinigungen.</p> : (
                    <ul className="flex flex-col gap-1">
                      {last.map((v) => (
                        <li key={v.id} className="flex items-center gap-2"><span className="text-ok">✓</span> {weekday(v.date)} {date(v.date)}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Als Nächstes geplant</h3>
                  {next.length === 0 ? <p className="text-muted">Gerade nichts geplant.</p> : (
                    <ul className="flex flex-col gap-1">
                      {next.map((v) => (
                        <li key={v.id}>{weekday(v.date)} {date(v.date)} · ab {v.start_time.slice(0, 5)} Uhr</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Card>
          );
        })}

        <Card title="Qualitätsberichte">
          {(inspections ?? []).length === 0 ? <p className="text-sm text-muted">Sobald wir Ihr Objekt geprüft haben, finden Sie hier den Bericht.</p> : (
            <ul className="divide-y divide-line">
              {(inspections ?? []).map((r) => {
                const score = inspectionScore(parseInspectionItems(r.items));
                return (
                  <li key={r.id}>
                    <Link href={`/portal/bericht/${r.id}`} className="py-2.5 flex items-center justify-between gap-3 hover:bg-soft -mx-2 px-2 rounded-lg text-sm">
                      <span><span className="font-semibold">{one(r.sites as { name: string } | { name: string }[] | null)?.name}</span> <span className="text-muted">· {date(r.date)}</span></span>
                      <Pill tone={scoreTone(score)}>Note {score?.toLocaleString("de-DE") ?? "–"}</Pill>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {(sites ?? []).length > 0 && (
          <Card title="Etwas hat nicht gepasst?">
            <ComplaintForm sites={(sites ?? []).map((s) => ({ id: s.id, name: s.name }))} />
          </Card>
        )}

        {(complaints ?? []).length > 0 && (
          <Card title="Ihre Meldungen">
            <ul className="divide-y divide-line text-sm">
              {(complaints ?? []).map((c) => (
                <li key={c.id} className="py-2.5 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs text-muted">{one(c.sites as { name: string } | { name: string }[] | null)?.name} · {date(c.created_at.slice(0, 10))}</div>
                    <div className="whitespace-pre-line">{c.text}</div>
                  </div>
                  <Pill tone={c.status === "erledigt" ? "ok" : "warn"}>{c.status === "erledigt" ? "erledigt" : "in Bearbeitung"}</Pill>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {(company?.phone || company?.email) && (
          <p className="text-sm text-muted">Fragen? {[company?.phone, company?.email].filter(Boolean).join(" · ")}</p>
        )}
      </div>
    </div>
  );
}
