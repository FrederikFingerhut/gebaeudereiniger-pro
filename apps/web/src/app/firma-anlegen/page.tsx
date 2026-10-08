import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { db } from "@/lib/supabase";
import { createCompany } from "../auth-actions";

// Nach der Bestätigung der E-Mail: Firma anlegen, falls noch keine da ist.
export default function CreateCompanyPage() {
  return (
    <div className="max-w-sm mx-auto mt-12 bg-surface border border-line rounded-2xl p-6">
      <h1 className="font-display font-extrabold text-2xl mb-6">Firma anlegen</h1>
      <Suspense fallback={<p className="text-sm text-muted">Lädt …</p>}>
        <CompanyForm />
      </Suspense>
    </div>
  );
}

async function CompanyForm() {
  const supabase = await db();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/anmelden");
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", data.claims.sub).maybeSingle();
  if (profile) redirect("/");
  const meta = (data.claims.user_metadata ?? {}) as { company_name?: string; full_name?: string };
  return (
    <ActionForm action={createCompany} submit="Firma anlegen">
      <Field label="Name der Firma">
        <input name="company" required defaultValue={meta.company_name} className={inputClass} />
      </Field>
      <Field label="Dein Name">
        <input name="name" required defaultValue={meta.full_name} className={inputClass} />
      </Field>
    </ActionForm>
  );
}
