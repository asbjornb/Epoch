import { useEffect, useRef } from "react";
import type { LogEntry } from "../types/game.ts";

interface LogModalProps {
  log: LogEntry[];
  onClose: () => void;
}

export function LogModal({ log, onClose }: LogModalProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, []);

  return (
    <div className="log-modal-overlay" onClick={onClose}>
      <div className="log-modal" onClick={(e) => e.stopPropagation()}>
        <div className="log-modal-header">
          <h3>Event Log</h3>
          <button className="log-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="log-modal-entries">
          {log.length === 0 && (
            <div className="log-empty">No events yet.</div>
          )}
          {log.map((entry, i) => (
            <div key={i} className={`log-entry log-${entry.type}`}>
              <span className="log-year">Y{entry.year}</span>
              <span className="log-msg">{entry.message}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
