/** Platzhalter, solange eine Seite lädt: graue Balken statt „Lädt …“. */
export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 animate-pulse" aria-busy="true" aria-label="Lädt">
      <div className="h-24 rounded-2xl bg-soft" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-10 rounded-xl bg-soft" style={{ width: `${70 + ((i * 37) % 30)}%` }} />
      ))}
    </div>
  );
}
