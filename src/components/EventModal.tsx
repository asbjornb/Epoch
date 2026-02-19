import { useEffect, useRef } from "react";
import type { EventPopup } from "../types/game.ts";

interface EventModalProps {
  event: EventPopup;
  onDismiss: () => void;
}

export function EventModal({ event, onDismiss }: EventModalProps) {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // Auto-dismiss after 3 seconds for previously-seen events
    if (!event.firstTime) {
      timerRef.current = window.setTimeout(onDismiss, 3000);
    }
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [event.firstTime, onDismiss]);

  const typeClass = `event-modal-${event.type}`;

  if (event.firstTime) {
    // Full modal with backdrop for first-time events
    return (
      <div className="event-modal-overlay" onClick={onDismiss}>
        <div
          className={`event-modal ${typeClass}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="event-modal-year">Year {event.year.toLocaleString()}</div>
          <h3 className="event-modal-title">{event.title}</h3>
          <p className="event-modal-message">{event.message}</p>
          <button className="event-modal-btn" onClick={onDismiss}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  // Toast-style notification for seen events
  return (
    <div className={`event-toast ${typeClass}`} onClick={onDismiss}>
      <div className="event-toast-header">
        <span className="event-toast-year">Y{event.year.toLocaleString()}</span>
        <span className="event-toast-title">{event.title}</span>
      </div>
      <p className="event-toast-message">{event.message}</p>
    </div>
  );
}
