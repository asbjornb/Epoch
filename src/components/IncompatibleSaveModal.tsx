import { useCallback } from "react";

interface IncompatibleSaveModalProps {
  saveJson: string;
  onDismiss: () => void;
}

export function IncompatibleSaveModal({ saveJson, onDismiss }: IncompatibleSaveModalProps) {
  const handleDownload = useCallback(() => {
    const blob = new Blob([saveJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "epoch-old-save.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [saveJson]);

  return (
    <div className="event-modal-overlay">
      <div
        className="event-modal event-modal-warning"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="event-modal-title">Incompatible Save Found</h3>
        <p className="event-modal-message">
          A saved game from an older version was found but is no longer compatible.
          You can download the old save data before starting fresh.
        </p>
        <div className="event-modal-actions">
          <button className="event-modal-btn" onClick={onDismiss}>
            Start Fresh
          </button>
          <button className="event-modal-btn-secondary" onClick={handleDownload}>
            Download Old Save
          </button>
        </div>
      </div>
    </div>
  );
}
