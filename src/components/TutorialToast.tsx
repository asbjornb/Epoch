import type { EventPopup } from "../types/game.ts";

interface TutorialToastProps {
  events: EventPopup[];
  onDismiss: (eventId: string) => void;
}

export function TutorialToast({ events, onDismiss }: TutorialToastProps) {
  if (events.length === 0) return null;

  return (
    <div className="tutorial-toast-stack">
      {events.map((event) => (
        <div
          key={event.eventId}
          className="tutorial-toast"
        >
          <div className="tutorial-toast-header">
            <div className="tutorial-toast-left">
              <span className="tutorial-toast-year">Y{event.year.toLocaleString()}</span>
              <span className="tutorial-toast-title">{event.title}</span>
            </div>
            <button
              className="tutorial-toast-close"
              onClick={() => onDismiss(event.eventId)}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
          <p className="tutorial-toast-message">{event.message}</p>
        </div>
      ))}
    </div>
  );
}
