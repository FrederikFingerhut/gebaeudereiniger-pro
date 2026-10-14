"use client";

import { useEffect, useRef, useState } from "react";
import { brand } from "@gp/shared";

/** Unterschriftenfeld: mit Finger oder Maus unterschreiben, Ergebnis als PNG im versteckten Feld. */
export function SignaturePad({ name, label }: { name: string; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [value, setValue] = useState("");
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = brand.colors.text;
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top] as const;
  };

  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setValue("");
  };

  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-semibold text-muted">{label}</span>
      <canvas
        ref={canvas}
        className="h-36 w-full rounded-lg border border-line bg-white touch-none cursor-crosshair"
        onPointerDown={(e) => {
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const ctx = e.currentTarget.getContext("2d")!;
          const [x, y] = point(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 0.1, y + 0.1);
          ctx.stroke();
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext("2d")!;
          const [x, y] = point(e);
          ctx.lineTo(x, y);
          ctx.stroke();
        }}
        onPointerUp={(e) => {
          drawing.current = false;
          setValue(e.currentTarget.toDataURL("image/png"));
        }}
        aria-label={label}
      />
      <input type="hidden" name={name} value={value} />
      <div className="flex justify-between text-xs text-muted">
        <span>{value ? "✓ unterschrieben" : "Hier unterschreiben"}</span>
        <button type="button" onClick={clear} className="font-semibold underline">Löschen</button>
      </div>
    </div>
  );
}
