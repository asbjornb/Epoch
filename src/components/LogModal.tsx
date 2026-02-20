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

  // Find most common collapse reason
  const collapseReasons = runHistory
    .filter((r) => r.outcome === "collapsed" && r.collapseReason)
    .map((r) => r.collapseReason!);
  const reasonCounts = new Map<string, number>();
  for (const reason of collapseReasons) {
    reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
  }
  const topCollapse = [...reasonCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0];

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
          <div className="stats-section-label">Year Reached</div>
          <div className="stats-grid">
            <div className="stats-card">
              <span className="stats-card-value">Y{bestYear}</span>
              <span className="stats-card-label">Best</span>
            </div>
            <div className="stats-card">
              <span className="stats-card-value">Y{avgYear}</span>
              <span className="stats-card-label">Average</span>
            </div>
          </div>
        </div>
      )}

      {topCollapse && (
        <div className="stats-section">
          <div className="stats-section-label">Top Collapse Reason</div>
          <div className="stats-collapse-reason">
            <span className="stats-collapse-reason-text">
              {topCollapse[0]}
            </span>
            <span className="stats-collapse-reason-count">
              {topCollapse[1]}x
            </span>
          </div>
        </div>
      )}

      {abandoned > 0 && (
        <div className="stats-section">
          <div className="stats-grid">
            <div className="stats-card">
              <span className="stats-card-value stats-dim">{abandoned}</span>
              <span className="stats-card-label">Abandoned</span>
            </div>
          </div>
        </div>
      )}

      {runHistory.length === 0 && (
        <div className="log-empty">
          Complete a run to see statistics here.
        </div>
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
