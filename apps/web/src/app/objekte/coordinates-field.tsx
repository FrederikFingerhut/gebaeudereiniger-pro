"use client";

import { useState } from "react";
import { inputClass } from "@/components/action-form";

/** Koordinaten mit Knopf „Meinen Standort übernehmen“ (wenn man gerade im Objekt steht) und Karten-Link zum Prüfen. */
export function CoordinatesField({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<string | null>(null);

  const locate = () => {
    if (!navigator.geolocation) return setStatus("Dieses Gerät kann keinen Standort bestimmen.");
    setStatus("Standort wird gesucht …");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setValue(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
        setStatus(`Übernommen (Genauigkeit ca. ${Math.round(pos.coords.accuracy)} m). Jetzt speichern.`);
      },
      () => setStatus("Standort nicht freigegeben. Bitte im Browser erlauben."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const [lat, lng] = value.split(/[,;\s]+/).map((n) => Number(n.replace(",", ".")));
  const valid = Number.isFinite(lat) && Number.isFinite(lng) && value.trim() !== "";

  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-semibold text-muted">Standort fürs Einstempeln (leer = aus Adresse)</span>
      <input name="coordinates" value={value} onChange={(e) => setValue(e.target.value)} placeholder="52.3759, 9.7320" className={inputClass} />
      <div className="flex flex-wrap items-center gap-2 mt-1">
        <button type="button" onClick={locate} className="rounded-lg bg-soft hover:bg-line px-3 py-1.5 font-semibold">
          Meinen Standort übernehmen
        </button>
        {valid && (
          <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`} target="_blank" rel="noreferrer" className="font-semibold text-primary">
            Auf der Karte prüfen
          </a>
        )}
      </div>
      {status && <span className="text-xs text-muted">{status}</span>}
    </div>
  );
}
