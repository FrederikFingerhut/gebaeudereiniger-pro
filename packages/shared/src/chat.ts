// Chat zwischen Mitarbeitern und Leitung: ein Gespräch je Mitarbeiter.

export interface ChatMessage {
  id: string;
  employee_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export const CHAT_MAX_LENGTH = 2000;

/** Nachrichten anderer, die nach dem letzten Lesen kamen. */
export function chatUnread(messages: ChatMessage[], me: string, lastReadAt: string | null | undefined): number {
  const since = lastReadAt ? Date.parse(lastReadAt) : 0;
  return messages.filter((m) => m.author_id !== me && Date.parse(m.created_at) > since).length;
}

export interface ChatThread {
  employeeId: string;
  last: ChatMessage;
  unread: number;
}

/** Gespräche für die Leitung: neueste zuerst, mit Zahl ungelesener Nachrichten. */
export function chatThreads(messages: ChatMessage[], me: string, reads: Record<string, string>): ChatThread[] {
  const byEmployee = new Map<string, ChatMessage[]>();
  for (const m of messages) byEmployee.set(m.employee_id, [...(byEmployee.get(m.employee_id) ?? []), m]);
  return [...byEmployee.entries()]
    .map(([employeeId, list]) => {
      const sorted = [...list].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      return { employeeId, last: sorted[0], unread: chatUnread(list, me, reads[employeeId]) };
    })
    .sort((a, b) => Date.parse(b.last.created_at) - Date.parse(a.last.created_at));
}

/** Text vor dem Senden: Leerzeichen am Rand weg, zu lange Nachrichten kürzen. Leer → null. */
export function cleanChatText(text: string): string | null {
  const trimmed = text.trim();
  return trimmed ? trimmed.slice(0, CHAT_MAX_LENGTH) : null;
}
