import { Suspense } from "react";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { brand } from "@gp/shared";
import { requireMe } from "@/lib/supabase";

// Druckseite: QR-Code zum Aufhängen im Objekt. Mitarbeiter scannen ihn beim Einstempeln.
export default function QrPage({ params }: PageProps<"/objekte/[id]/qr">) {
  return (
    <Suspense fallback={<p className="text-muted">Lädt …</p>}>
      <Qr params={params} />
    </Suspense>
  );
}

async function Qr({ params }: { params: PageProps<"/objekte/[id]/qr">["params"] }) {
  const { id } = await params;
  const { supabase } = await requireMe();
  const [{ data: site }, { data: token }] = await Promise.all([
    supabase.from("sites").select("name, address").eq("id", id).maybeSingle(),
    supabase.from("site_clock_tokens").select("token").eq("site_id", id).maybeSingle(),
  ]);
  if (!site || !token) notFound();
  const svg = await QRCode.toString(token.token, { type: "svg", margin: 1, color: { dark: brand.colors.text, light: brand.colors.surface } });

  return (
    <div className="max-w-md mx-auto text-center flex flex-col items-center gap-4 py-8 bg-surface rounded-2xl">
      <div className="font-display font-extrabold text-xl">{brand.name}</div>
      <div className="w-72" dangerouslySetInnerHTML={{ __html: svg }} />
      <div>
        <div className="font-display font-bold text-2xl">{site.name}</div>
        <div className="text-muted">{site.address}</div>
      </div>
      <p className="text-sm">Zum Einstempeln in der App „QR-Code scannen“ wählen.</p>
      <p className="text-xs text-muted print:hidden">Mit Strg+P (Mac: Cmd+P) drucken und gut sichtbar im Objekt anbringen.</p>
    </div>
  );
}
