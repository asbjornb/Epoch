import type { RunState } from "../types/game.ts";
import type { GameAction } from "../hooks/useGame.ts";

interface ControlsProps {
  run: RunState;
  totalRuns: number;
  dispatch: React.Dispatch<GameAction>;
}

const SPEEDS = [1, 5, 20, 100, 500];

export function Controls({ run, totalRuns, dispatch }: ControlsProps) {
  const isIdle = run.status === "idle";
  const isRunning = run.status === "running";
  const isPaused = run.status === "paused";
  const isEnded = run.status === "collapsed" || run.status === "victory";

  return (
    <div className="controls">
      <div className="controls-left">
        {isIdle && (
          <button
            className="ctrl-btn primary"
            onClick={() => dispatch({ type: "start_run" })}
            disabled={run.queue.length === 0}
          >
            ▶ Start Run
          </button>
        )}
        {isRunning && (
          <button
            className="ctrl-btn"
            onClick={() => dispatch({ type: "pause_run" })}
          >
            ⏸ Pause
          </button>
        )}
        {isPaused && (
          <button
            className="ctrl-btn primary"
            onClick={() => dispatch({ type: "resume_run" })}
          >
            ▶ Resume
          </button>
        )}
        {isEnded && (
          <button
            className="ctrl-btn primary"
            onClick={() => dispatch({ type: "reset_run" })}
          >
            ↻ New Run
          </button>
        )}
      </div>

      <div className="controls-center">
        {isEnded && (
          <div
            className={`run-result ${run.status === "victory" ? "victory" : "collapse"}`}
          >
            {run.status === "victory"
              ? "Victory!"
              : `Collapsed: ${run.collapseReason ?? "Unknown"}`}
            {run.status === "collapsed" && run.autoRestart && (
              <span className="auto-restart-notice"> (restarting...)</span>
            )}
          </div>
        )}
      </div>

      <div className="controls-right">
        <label className="auto-restart-toggle" title="Automatically restart on collapse">
          <input
            type="checkbox"
            checked={run.autoRestart}
            onChange={() => dispatch({ type: "toggle_auto_restart" })}
          />
          <span className="auto-restart-label">Auto</span>
        </label>
        <div className="speed-selector">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={`speed-btn ${run.speed === s ? "active" : ""}`}
              onClick={() => dispatch({ type: "set_speed", speed: s })}
            >
              {s}x
            </button>
          ))}
        </div>
        <span className="run-counter">Run #{totalRuns + 1}</span>
      </div>
    </div>
  );
}
