import { useEffect, useRef } from "react";
import type { EventPopup } from "../types/game.ts";

interface EventModalProps {
  event: EventPopup;
  autoDismiss: boolean;
  onDismiss: () => void;
  onDismissNoPause: () => void;
}

export function EventModal({ event, autoDismiss, onDismiss, onDismissNoPause }: EventModalProps) {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // Auto-dismiss after 7 seconds for events the player opted to not pause for
    if (autoDismiss) {
      timerRef.current = window.setTimeout(onDismiss, 7000);
    }
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [autoDismiss, onDismiss]);

  const typeClass = `event-modal-${event.type}`;

  if (!autoDismiss) {
    // Full modal with backdrop — player hasn't opted out yet
    return (
      <div className="event-modal-overlay">
        <div
          className={`event-modal ${typeClass}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="event-modal-year">Year {event.year.toLocaleString()}</div>
          <h3 className="event-modal-title">{event.title}</h3>
          <p className="event-modal-message">{event.message}</p>
          <div className="event-modal-actions">
            <button className="event-modal-btn" onClick={onDismiss}>
              Continue
            </button>
            <button className="event-modal-btn-secondary" onClick={onDismissNoPause}>
              Don't pause for this again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Toast-style notification for auto-dismissed events (5s display)
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
