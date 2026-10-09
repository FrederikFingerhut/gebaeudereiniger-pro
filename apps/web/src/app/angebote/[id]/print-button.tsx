"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-lg bg-primary text-on-primary px-4 py-2 text-sm font-bold">
      Drucken oder als PDF speichern
    </button>
  );
}
