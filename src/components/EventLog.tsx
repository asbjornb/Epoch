import { useEffect, useRef } from "react";
import type { LogEntry } from "../types/game.ts";

interface EventLogProps {
  log: LogEntry[];
}

export function EventLog({ log }: EventLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length]);

  const recent = log.slice(-50);

  return (
    <div className="event-log">
      <h3>Log</h3>
      <div className="log-entries">
        {recent.length === 0 && (
          <div className="log-empty">No events yet.</div>
        )}
        {recent.map((entry, i) => (
          <div key={i} className={`log-entry log-${entry.type}`}>
            <span className="log-year">Y{entry.year}</span>
            <span className="log-msg">{entry.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
