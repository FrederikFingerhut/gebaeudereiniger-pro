import { Suspense } from "react";
import { berlinDate } from "@gp/shared";
import { Card, PageTitle } from "@/components/ui";
import { Skeleton } from "@/components/skeleton";
import { requireMe } from "@/lib/supabase";
import { loadConversation, loadThreads } from "./actions";
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
  const { profile } = await requireMe();
  if (!["objektleiter", "buero", "chef"].includes(profile.role)) {
    return <Card title="Keine Berechtigung"><p className="text-sm">Den Chat im Büro nutzen Vorarbeiter, Büro und Chef. Mitarbeiter schreiben in der Handy-App.</p></Card>;
  }
  const params = await searchParams;
  const threads = await loadThreads();
  const wanted = typeof params.mit === "string" ? params.mit : null;
  const selected = wanted && threads.some((t) => t.id === wanted) ? wanted : null;
  const conversation = selected ? await loadConversation(selected) : [];
  return <ChatView key={selected ?? "liste"} threads={threads} selected={selected} conversation={conversation} today={berlinDate()} />;
}
