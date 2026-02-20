import { useRef, useState } from "react";
import type { GameState } from "../types/game.ts";
import type { GameAction } from "../hooks/useGame.ts";
import { exportSave, validateSave } from "../hooks/useGame.ts";

interface SettingsPanelProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  onClose: () => void;
  wakeLock?: { supported: boolean; enabled: boolean; active: boolean; toggle: () => void };
}

const EVENT_LABELS: Record<string, string> = {
  food_cap_unlock: "New Skills Discovered",
  raider_survived: "Raiders Repelled",
  winter_start: "The Great Cold",
  winter_end: "Spring Returns",
};

export function SettingsPanel({ state, dispatch, onClose, wakeLock }: SettingsPanelProps) {
  const [importText, setImportText] = useState("");
  const [feedback, setFeedback] = useState<{ msg: string; type: "success" | "danger" } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showFeedback = (msg: string, type: "success" | "danger") => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleExport = () => {
    const json = exportSave(state);
    navigator.clipboard.writeText(json).then(
      () => showFeedback("Save copied to clipboard", "success"),
      () => {
        // Fallback: select the text in a textarea
        setImportText(json);
        showFeedback("Clipboard unavailable - save pasted into text box", "danger");
      },
    );
  };

  const handleDownload = () => {
    const json = exportSave(state);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `epoch-save-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showFeedback("Save file downloaded", "success");
  };

  const handleImport = () => {
    const parsed = validateSave(importText.trim());
    if (parsed) {
      dispatch({ type: "import_save", state: parsed });
      setImportText("");
      showFeedback("Save imported successfully", "success");
    } else {
      showFeedback("Invalid save data", "danger");
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const parsed = validateSave(text);
      if (parsed) {
        dispatch({ type: "import_save", state: parsed });
        showFeedback("Save imported from file", "success");
      } else {
        showFeedback("Invalid save file", "danger");
      }
    };
    reader.readAsText(file);
    // Reset so same file can be re-imported
    e.target.value = "";
  };

  const handleHardReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    dispatch({ type: "hard_reset" });
    setConfirmReset(false);
    showFeedback("All progress wiped", "success");
  };

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h3>Settings</h3>
          <button className="settings-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {feedback && (
          <div className={`settings-feedback settings-feedback-${feedback.type}`}>
            {feedback.msg}
          </div>
        )}

        {/* Keep Screen On */}
        {wakeLock?.supported && (
          <div className="settings-section">
            <div className="settings-row">
              <label className="auto-restart-toggle">
                <input
                  type="checkbox"
                  checked={wakeLock.enabled}
                  onChange={wakeLock.toggle}
                />
                <span className="auto-restart-label">Keep screen on</span>
              </label>
              {wakeLock.enabled && (
                <span className="settings-wake-status">
                  {wakeLock.active ? "Active" : "Inactive"}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Event Pause Preferences */}
        {(state.autoDismissEventTypes.length > 0 || state.autoDismissRunSummary) && (
          <div className="settings-section">
            <div className="settings-section-label">Event Pause Settings</div>
            {state.autoDismissRunSummary && (
              <div className="settings-auto-dismiss-item">
                <span className="settings-auto-dismiss-name">
                  Run Summary (Collapse/Victory)
                </span>
                <button
                  className="settings-auto-dismiss-undo"
                  onClick={() => dispatch({ type: "set_auto_dismiss_run_summary", value: false })}
                >
                  Show full details
                </button>
              </div>
            )}
            <div className="settings-auto-dismiss-list">
              {state.autoDismissEventTypes.map((eventId) => (
                <div key={eventId} className="settings-auto-dismiss-item">
                  <span className="settings-auto-dismiss-name">
                    {EVENT_LABELS[eventId] || eventId}
                  </span>
                  <button
                    className="settings-auto-dismiss-undo"
                    onClick={() => dispatch({ type: "reset_auto_dismiss", eventId })}
                  >
                    Re-enable pause
                  </button>
                </div>
              ))}
            </div>
            {state.autoDismissEventTypes.length > 1 && (
              <button
                className="ctrl-btn"
                onClick={() => dispatch({ type: "reset_all_auto_dismiss" })}
              >
                Re-enable all pauses
              </button>
            )}
          </div>
        )}

        {/* Export */}
        <div className="settings-section">
          <div className="settings-section-label">Export Save</div>
          <div className="settings-row">
            <button className="ctrl-btn" onClick={handleExport}>
              Copy to Clipboard
            </button>
            <button className="ctrl-btn" onClick={handleDownload}>
              Download File
            </button>
          </div>
        </div>

        {/* Import */}
        <div className="settings-section">
          <div className="settings-section-label">Import Save</div>
          <textarea
            className="settings-import-textarea"
            placeholder="Paste save data here..."
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={3}
          />
          <div className="settings-row">
            <button
              className="ctrl-btn"
              onClick={handleImport}
              disabled={!importText.trim()}
            >
              Import from Text
            </button>
            <button className="ctrl-btn" onClick={() => fileInputRef.current?.click()}>
              Import from File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={handleFileImport}
            />
          </div>
        </div>

        {/* Danger Zone */}
        <div className="settings-section settings-danger-zone">
          <div className="settings-section-label">Danger Zone</div>
          <button
            className={`ctrl-btn settings-reset-btn ${confirmReset ? "confirming" : ""}`}
            onClick={handleHardReset}
          >
            {confirmReset ? "Are you sure? Click again to confirm" : "Reset All Progress"}
          </button>
        </div>
      </div>
    </div>
  );
}
