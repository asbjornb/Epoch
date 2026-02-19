import { useState, useEffect, useRef } from "react";
import type { LogEntry, RunHistoryEntry } from "../types/game.ts";
import { getActionDef } from "../types/actions.ts";

interface LogModalProps {
  log: LogEntry[];
  runHistory: RunHistoryEntry[];
  onClose: () => void;
}

function RunHistoryPanel({ runHistory }: { runHistory: RunHistoryEntry[] }) {
  if (runHistory.length === 0) {
    return <div className="log-empty">No completed runs yet.</div>;
  }

  return (
    <div className="run-history-list">
      {runHistory.map((entry, i) => (
        <RunHistoryCard key={i} entry={entry} />
      ))}
    </div>
  );
}

function RunHistoryCard({ entry }: { entry: RunHistoryEntry }) {
  const [expanded, setExpanded] = useState(false);

  const outcomeClass =
    entry.outcome === "victory"
      ? "success"
      : entry.outcome === "collapsed"
        ? "danger"
        : "dim";

  const outcomeLabel =
    entry.outcome === "victory"
      ? "Victory"
      : entry.outcome === "collapsed"
        ? "Collapsed"
        : "Abandoned";

  const r = entry.resources;

  return (
    <div className={`run-history-card run-history-${entry.outcome}`}>
      <button
        className="run-history-card-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="run-history-run">#{entry.runNumber}</span>
        <span className={`run-history-outcome run-history-outcome-${outcomeClass}`}>
          {outcomeLabel}
        </span>
        <span className="run-history-year">Y{entry.year}</span>
        <span className="run-history-chevron">{expanded ? "\u25B4" : "\u25BE"}</span>
      </button>

      {expanded && (
        <div className="run-history-details">
          {entry.collapseReason && (
            <div className="run-history-reason">{entry.collapseReason}</div>
          )}

          <div className="run-history-section">
            <div className="run-history-section-label">Resources</div>
            <div className="run-history-stats">
              <Stat label="Food" value={Math.floor(r.food)} />
              <Stat label="Pop" value={`${r.population}/${r.maxPopulation}`} />
              <Stat label="Materials" value={Math.floor(r.materials)} />
              <Stat label="Defense" value={`${Math.floor(r.militaryStrength)}+${Math.floor(r.wallDefense)}w`} />
              <Stat label="Tech" value={r.techLevel} />
              <Stat label="Storage" value={Math.floor(r.foodStorage)} />
            </div>
          </div>

          <div className="run-history-section">
            <div className="run-history-section-label">Queue</div>
            {entry.queue.length === 0 ? (
              <div className="run-history-queue-empty">No actions queued</div>
            ) : (
              <div className="run-history-queue">
                {entry.queue.map((actionId, j) => {
                  const def = getActionDef(actionId);
                  return (
                    <span key={j} className="run-history-action-chip">
                      {def?.name ?? actionId}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="run-history-stat">
      <span className="run-history-stat-label">{label}</span>
      <span className="run-history-stat-value">{value}</span>
    </div>
  );
}

export function LogModal({ log, runHistory, onClose }: LogModalProps) {
  const [tab, setTab] = useState<"log" | "history">("log");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tab === "log") {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [tab]);

  return (
    <div className="log-modal-overlay" onClick={onClose}>
      <div className="log-modal" onClick={(e) => e.stopPropagation()}>
        <div className="log-modal-header">
          <div className="log-modal-tabs">
            <button
              className={`log-modal-tab${tab === "log" ? " active" : ""}`}
              onClick={() => setTab("log")}
            >
              Event Log
            </button>
            <button
              className={`log-modal-tab${tab === "history" ? " active" : ""}`}
              onClick={() => setTab("history")}
            >
              Run History
            </button>
          </div>
          <button className="log-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="log-modal-entries">
          {tab === "log" && (
            <>
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
            </>
          )}
          {tab === "history" && (
            <RunHistoryPanel runHistory={runHistory} />
          )}
        </div>
      </div>
    </div>
  );
}
