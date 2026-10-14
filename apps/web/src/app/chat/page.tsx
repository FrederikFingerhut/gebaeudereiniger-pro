import { Suspense } from "react";
import { berlinDate } from "@gp/shared";
import { Card, PageTitle } from "@/components/ui";
import { Skeleton } from "@/components/skeleton";
import { requireMe } from "@/lib/supabase";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { loadConversation, loadThreads, saveDeeplKey } from "./actions";
import { ChatView } from "./chat-view";

export default function ChatPage({ searchParams }: PageProps<"/chat">) {
  return (
    <>
      <PageTitle note="Jeder Mitarbeiter hat ein Gespräch mit der Leitung. Büro, Vorarbeiter und Chef lesen und antworten gemeinsam.">Chat</PageTitle>
      <Suspense fallback={<Skeleton rows={6} />}>
        <ChatLoader searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ChatLoader({ searchParams }: { searchParams: PageProps<"/chat">["searchParams"] }) {
  const { supabase, profile, isOffice } = await requireMe();
  if (!["objektleiter", "buero", "chef"].includes(profile.role)) {
    return <Card title="Keine Berechtigung"><p className="text-sm">Den Chat im Büro nutzen Vorarbeiter, Büro und Chef. Mitarbeiter schreiben in der Handy-App.</p></Card>;
  }
  const params = await searchParams;
  const threads = await loadThreads();
  const wanted = typeof params.mit === "string" ? params.mit : null;
  const selected = wanted && threads.some((t) => t.id === wanted) ? wanted : null;
  const conversation = selected ? await loadConversation(selected) : [];
  const { data: integration } = isOffice ? await supabase.from("company_integrations").select("deepl_api_key").maybeSingle() : { data: null };
  const translating = !!integration?.deepl_api_key;
  return (
    <div className="flex flex-col gap-4">
      <ChatView key={selected ?? "liste"} threads={threads} selected={selected} conversation={conversation} today={berlinDate()} />
      {isOffice && (
        <details className="bg-surface border border-line rounded-2xl p-4" open={!translating}>
          <summary className="cursor-pointer font-semibold">{translating ? "Übersetzung ist an ✓" : "Übersetzung einschalten"}</summary>
          <div className="mt-3 flex flex-col gap-3 text-sm max-w-2xl">
            <p>
              Mit DeepL übersetzt die App jede Nachricht automatisch: Mitarbeiter lesen deine Nachrichten in ihrer Sprache (Englisch, Russisch, Ukrainisch), und du liest ihre auf Deutsch. Das Original steht klein darunter.
            </p>
            {!translating && (
              <ol className="list-decimal pl-5 text-muted">
                <li>
                  Auf <a href="https://www.deepl.com/pro-api" target="_blank" rel="noreferrer" className="underline">deepl.com/pro-api</a> das kostenlose Paket „DeepL API Free“ wählen (500.000 Zeichen im Monat, reicht für den Chat locker).
                </li>
                <li>Im DeepL-Konto unter „API-Schlüssel“ den Schlüssel kopieren.</li>
                <li>Hier einfügen und speichern.</li>
              </ol>
            )}
            <ActionForm action={saveDeeplKey} submit={translating ? "Speichern" : "Einschalten"} className="flex flex-col gap-3">
              <Field label={translating ? "Neuer Schlüssel (leer speichern zum Ausschalten)" : "DeepL-Schlüssel"}>
                <input name="key" type="password" autoComplete="off" placeholder={translating ? "••••••••  (gespeichert)" : "Schlüssel aus DeepL einfügen"} className={inputClass} />
              </Field>
            </ActionForm>
          </div>
        </details>
      )}
    </div>
  );
}
