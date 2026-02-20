import { useState, useEffect, useRef } from "react";
import type { LogEntry, RunHistoryEntry } from "../types/game.ts";
import { getActionDef } from "../types/actions.ts";

interface LogModalProps {
  log: LogEntry[];
  runHistory: RunHistoryEntry[];
  totalRuns: number;
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
  const hasWaste =
    Math.floor(r.food) > 0 ||
    Math.floor(r.materials) > 0 ||
    (entry.totalFoodSpoiled ?? 0) > 0;

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
              <Stat label="Pop" value={`${r.population}/${r.maxPopulation}`} />
              <Stat label="Defense" value={`${Math.floor(r.militaryStrength)}+${Math.floor(r.wallDefense)}w`} />
              <Stat label="Tech" value={r.techLevel} />
            </div>
          </div>

          {hasWaste && (
            <div className="run-history-section">
              <div className="run-history-section-label">Waste</div>
              <div className="run-history-stats">
                {Math.floor(r.food) > 0 && (
                  <Stat label="Food left" value={Math.floor(r.food)} warn />
                )}
                {Math.floor(r.materials) > 0 && (
                  <Stat label="Materials left" value={Math.floor(r.materials)} warn />
                )}
                {(entry.totalFoodSpoiled ?? 0) > 0 && (
                  <Stat label="Food spoiled" value={Math.floor(entry.totalFoodSpoiled!)} warn />
                )}
              </div>
            </div>
          )}

          <div className="run-history-section">
            <div className="run-history-section-label">Queue</div>
            {entry.queue.length === 0 ? (
              <div className="run-history-queue-empty">No actions queued</div>
            ) : (
              <div className="run-history-queue">
                {entry.queue.map((qe, j) => {
                  const def = getActionDef(qe.actionId);
                  const repeatLabel =
                    qe.repeat === -1 ? "\u221E" : qe.repeat > 1 ? `\u00D7${qe.repeat}` : "";
                  return (
                    <div key={j} className="run-history-action-row">
                      <span className="run-history-action-index">{j + 1}.</span>
                      <span className="run-history-action-name">
                        {def?.name ?? qe.actionId}
                      </span>
                      {repeatLabel && (
                        <span className="run-history-action-repeat">{repeatLabel}</span>
                      )}
                    </div>
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

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className={`run-history-stat${warn ? " run-history-stat-warn" : ""}`}>
      <span className="run-history-stat-label">{label}</span>
      <span className="run-history-stat-value">{value}</span>
    </div>
  );
}

function StatisticsPanel({
  runHistory,
  totalRuns,
}: {
  runHistory: RunHistoryEntry[];
  totalRuns: number;
}) {
  const victories = runHistory.filter((r) => r.outcome === "victory").length;
  const collapses = runHistory.filter((r) => r.outcome === "collapsed").length;
  const abandoned = runHistory.filter((r) => r.outcome === "abandoned").length;

  const bestYear =
    runHistory.length > 0
      ? Math.max(...runHistory.map((r) => r.year))
      : 0;

  const avgYear =
    runHistory.length > 0
      ? Math.round(
          runHistory.reduce((sum, r) => sum + r.year, 0) / runHistory.length,
        )
      : 0;

  const collapseReasons = runHistory
    .filter((r) => r.outcome === "collapsed" && r.collapseReason)
    .reduce<Record<string, number>>((acc, r) => {
      const reason = r.collapseReason!;
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {});

  const sortedReasons = Object.entries(collapseReasons).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <div className="stats-panel">
      <div className="stats-section">
        <div className="stats-section-label">Overview</div>
        <div className="stats-grid">
          <div className="stats-card">
            <span className="stats-card-value">{totalRuns + 1}</span>
            <span className="stats-card-label">Current Run</span>
          </div>
          <div className="stats-card">
            <span className="stats-card-value">{totalRuns}</span>
            <span className="stats-card-label">Completed</span>
          </div>
          <div className="stats-card">
            <span className="stats-card-value stats-victory">{victories}</span>
            <span className="stats-card-label">Victories</span>
          </div>
          <div className="stats-card">
            <span className="stats-card-value stats-collapse">{collapses}</span>
            <span className="stats-card-label">Collapses</span>
          </div>
        </div>
      </div>

      {runHistory.length > 0 && (
        <div className="stats-section">
          <div className="stats-section-label">Years</div>
          <div className="stats-grid">
            <div className="stats-card">
              <span className="stats-card-value">{bestYear.toLocaleString()}</span>
              <span className="stats-card-label">Best Year</span>
            </div>
            <div className="stats-card">
              <span className="stats-card-value">{avgYear.toLocaleString()}</span>
              <span className="stats-card-label">Avg Year</span>
            </div>
          </div>
        </div>
      )}

      {runHistory.length > 0 && (
        <div className="stats-section">
          <div className="stats-section-label">Outcomes</div>
          <div className="stats-outcome-bar">
            {victories > 0 && (
              <div
                className="stats-outcome-segment stats-outcome-victory"
                style={{ flex: victories }}
                title={`${victories} victories`}
              />
            )}
            {collapses > 0 && (
              <div
                className="stats-outcome-segment stats-outcome-collapse"
                style={{ flex: collapses }}
                title={`${collapses} collapses`}
              />
            )}
            {abandoned > 0 && (
              <div
                className="stats-outcome-segment stats-outcome-abandoned"
                style={{ flex: abandoned }}
                title={`${abandoned} abandoned`}
              />
            )}
          </div>
          <div className="stats-outcome-legend">
            {victories > 0 && (
              <span className="stats-legend-item">
                <span className="stats-legend-dot stats-outcome-victory" />
                {victories} victory{victories !== 1 ? "s" : ""}
              </span>
            )}
            {collapses > 0 && (
              <span className="stats-legend-item">
                <span className="stats-legend-dot stats-outcome-collapse" />
                {collapses} collapse{collapses !== 1 ? "s" : ""}
              </span>
            )}
            {abandoned > 0 && (
              <span className="stats-legend-item">
                <span className="stats-legend-dot stats-outcome-abandoned" />
                {abandoned} abandoned
              </span>
            )}
          </div>
        </div>
      )}

      {sortedReasons.length > 0 && (
        <div className="stats-section">
          <div className="stats-section-label">Collapse Reasons</div>
          <div className="stats-reasons">
            {sortedReasons.map(([reason, count]) => (
              <div key={reason} className="stats-reason-row">
                <span className="stats-reason-text">{reason}</span>
                <span className="stats-reason-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {runHistory.length === 0 && (
        <div className="log-empty">No completed runs yet. Statistics will appear after your first run.</div>
      )}
    </div>
  );
}

export function LogModal({ log, runHistory, totalRuns, onClose }: LogModalProps) {
  const [tab, setTab] = useState<"log" | "history" | "stats">("log");
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
            <button
              className={`log-modal-tab${tab === "stats" ? " active" : ""}`}
              onClick={() => setTab("stats")}
            >
              Statistics
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
          {tab === "stats" && (
            <StatisticsPanel runHistory={runHistory} totalRuns={totalRuns} />
          )}
        </div>
      </div>
    </div>
  );
}
