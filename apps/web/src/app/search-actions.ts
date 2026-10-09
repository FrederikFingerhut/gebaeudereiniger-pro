"use server";

import { requireMe } from "@/lib/supabase";

export type Hit = { kind: string; label: string; sub?: string; href: string };

/** Schnellsuche über Objekte, Kunden, Mitarbeiter und Angebote (Angebote nur fürs Büro). */
export async function search(query: string): Promise<Hit[]> {
  // Zeichen entfernen, die in der Filter-Syntax eine Bedeutung haben.
  const q = query.replace(/[%_,()\\*]/g, " ").trim().slice(0, 60);
  if (q.length < 2) return [];
  const { supabase, isOffice } = await requireMe();
  const like = `%${q}%`;
  const [sites, customers, people, offers] = await Promise.all([
    supabase.from("sites").select("id, name, address").or(`name.ilike.${like},address.ilike.${like}`).order("name").limit(6),
    supabase.from("customers").select("id, name, email").ilike("name", like).order("name").limit(5),
    supabase.from("profiles").select("id, full_name, role").ilike("full_name", like).order("full_name").limit(5),
    isOffice
      ? supabase.from("offers").select("id, number, title, recipient").or(`number.ilike.${like},title.ilike.${like},recipient.ilike.${like}`).order("created_at", { ascending: false }).limit(5)
      : Promise.resolve({ data: [] as { id: string; number: string; title: string; recipient: string }[] }),
  ]);
  return [
    ...(sites.data ?? []).map((s) => ({ kind: "Objekt", label: s.name, sub: s.address, href: `/objekte/${s.id}` })),
    ...(customers.data ?? []).map((c) => ({ kind: "Kunde", label: c.name, sub: c.email ?? undefined, href: "/objekte" })),
    ...(people.data ?? []).map((p) => ({ kind: p.role === "kunde" ? "Kundenzugang" : "Mitarbeiter", label: p.full_name, href: p.role === "kunde" ? "/objekte" : "/mitarbeiter" })),
    ...(offers.data ?? []).map((o) => ({ kind: "Angebot", label: `${o.number} ${o.title}`, sub: o.recipient.split("\n")[0], href: `/angebote/${o.id}` })),
  ];
}
