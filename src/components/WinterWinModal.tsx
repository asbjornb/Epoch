import type { EventPopup } from "../types/game.ts";

interface WinterWinModalProps {
  event: EventPopup;
  totalRuns: number;
  onDismiss: () => void;
}

export function WinterWinModal({ event, totalRuns, onDismiss }: WinterWinModalProps) {
  return (
    <div className="event-modal-overlay">
      <div
        className="winter-win-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="winter-win-year">Year {event.year.toLocaleString()}</div>
        <h3 className="winter-win-title">Spring Returns</h3>
        <p className="winter-win-message">
          The Great Cold has passed. Against all odds, your people endured the long
          winter — farming silenced, food dwindling, yet your civilization held firm.
        </p>
        <div className="winter-win-stats">
          <div className="winter-win-stat">
            <span className="winter-win-stat-label">Runs</span>
            <span className="winter-win-stat-value">{totalRuns}</span>
          </div>
          <div className="winter-win-stat">
            <span className="winter-win-stat-label">Years Survived</span>
            <span className="winter-win-stat-value">{event.year.toLocaleString()}</span>
          </div>
        </div>
        <p className="winter-win-teaser">
          More challenges lie ahead. New content is on the way — but for now, your
          civilization marches onward.
        </p>
        <div className="winter-win-actions">
          <button className="winter-win-btn" onClick={onDismiss}>
            Continue Playing
          </button>
        </div>
      </div>
    </div>
  );
}
