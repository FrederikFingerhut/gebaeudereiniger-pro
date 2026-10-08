import type { Language } from "./types";

// Texte der Mitarbeiter-App. Neue Sprache = neuer Block mit denselben Schlüsseln.
const de = {
  greeting: "Guten Morgen",
  myVisits: "Meine Einsätze",
  noVisits: "Heute keine Einsätze",
  clockIn: "Einstempeln",
  clockOut: "Ausstempeln",
  runningFor: "Läuft seit",
  checklist: "Checkliste",
  reportProblem: "Problem melden",
  addPhoto: "Foto hinzufügen",
  send: "Senden",
  siteInfo: "Objektinfo",
  access: "Zugang",
  contact: "Ansprechpartner",
  special: "Besonderheit",
  back: "Zurück",
  done: "Erledigt",
  open: "Offen",
  reportSick: "Krank melden",
  problemPlaceholder: "Was ist los? z. B. Material fehlt",
  reportSent: "Meldung ans Büro geschickt",
  clockedOut: "Ausgestempelt. Danke!",
};

export type TextKey = keyof typeof de;

const en: Record<TextKey, string> = {
  greeting: "Good morning",
  myVisits: "My jobs",
  noVisits: "No jobs today",
  clockIn: "Clock in",
  clockOut: "Clock out",
  runningFor: "Running for",
  checklist: "Checklist",
  reportProblem: "Report a problem",
  addPhoto: "Add photo",
  send: "Send",
  siteInfo: "Site info",
  access: "Access",
  contact: "Contact",
  special: "Note",
  back: "Back",
  done: "Done",
  open: "Open",
  reportSick: "Report sick",
  problemPlaceholder: "What's wrong? e.g. supplies missing",
  reportSent: "Report sent to the office",
  clockedOut: "Clocked out. Thank you!",
};

const ru: Record<TextKey, string> = {
  greeting: "Доброе утро",
  myVisits: "Мои задания",
  noVisits: "Сегодня заданий нет",
  clockIn: "Начать работу",
  clockOut: "Закончить работу",
  runningFor: "Идёт",
  checklist: "Чек-лист",
  reportProblem: "Сообщить о проблеме",
  addPhoto: "Добавить фото",
  send: "Отправить",
  siteInfo: "Об объекте",
  access: "Доступ",
  contact: "Контакт",
  special: "Важно",
  back: "Назад",
  done: "Готово",
  open: "Открыто",
  reportSick: "Сообщить о болезни",
  problemPlaceholder: "Что случилось? Напр., нет средств",
  reportSent: "Сообщение отправлено в офис",
  clockedOut: "Работа завершена. Спасибо!",
};

const uk: Record<TextKey, string> = {
  greeting: "Доброго ранку",
  myVisits: "Мої завдання",
  noVisits: "Сьогодні завдань немає",
  clockIn: "Почати роботу",
  clockOut: "Завершити роботу",
  runningFor: "Триває",
  checklist: "Чек-лист",
  reportProblem: "Повідомити про проблему",
  addPhoto: "Додати фото",
  send: "Надіслати",
  siteInfo: "Про об'єкт",
  access: "Доступ",
  contact: "Контакт",
  special: "Важливо",
  back: "Назад",
  done: "Готово",
  open: "Відкрито",
  reportSick: "Повідомити про хворобу",
  problemPlaceholder: "Що сталося? Напр., немає засобів",
  reportSent: "Повідомлення надіслано в офіс",
  clockedOut: "Роботу завершено. Дякуємо!",
};

export const texts: Record<Language, Record<TextKey, string>> = { de, en, ru, uk };
export const languages: { code: Language; label: string }[] = [
  { code: "de", label: "Deutsch" },
  { code: "en", label: "English" },
  { code: "ru", label: "Русский" },
  { code: "uk", label: "Українська" },
];

export function t(lang: Language, key: TextKey): string {
  return texts[lang]?.[key] ?? de[key];
}
