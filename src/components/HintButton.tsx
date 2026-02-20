import { useState, useRef, useEffect } from "react";
import type { GameState } from "../types/game.ts";
import { getSkillHint } from "../engine/hints.ts";

export function HintButton({ state }: { state: GameState }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const hint = getSkillHint(state);

  return (
    <div className="hint-wrapper" ref={ref}>
      <button
        className="hint-btn"
        onClick={() => setOpen((v) => !v)}
        title="Tip"
        aria-label="Show hint"
      >
        ?
      </button>
      {open && (
        <div className="hint-popover">
          <div className="hint-popover-label">Tip</div>
          <div className="hint-popover-text">{hint}</div>
        </div>
      )}
    </div>
  );
}
