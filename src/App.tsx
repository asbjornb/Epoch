import { useState, useCallback } from "react";
import { useGame } from "./hooks/useGame.ts";
import { useWakeLock } from "./hooks/useWakeLock.ts";
import { QueuePanel } from "./components/QueuePanel.tsx";
import { ResourceBar } from "./components/ResourceBar.tsx";
import { SkillsPanel } from "./components/SkillsPanel.tsx";
import { EventModal } from "./components/EventModal.tsx";
import { RunSummaryModal } from "./components/RunSummaryModal.tsx";
import { LogModal } from "./components/LogModal.tsx";
import { SettingsPanel } from "./components/SettingsPanel.tsx";

function App() {
  const { state, dispatch } = useGame();
  const wakeLock = useWakeLock();
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [summaryDismissedAtRun, setSummaryDismissedAtRun] = useState(-1);

  const isEnded = state.run.status === "collapsed" || state.run.status === "victory";
  const showRunSummary = isEnded && state.totalRuns !== summaryDismissedAtRun;

  const pendingEvent = state.run.pendingEvents[0] ?? null;

  const handleDismissEvent = useCallback(() => {
    dispatch({ type: "dismiss_event" });
  }, [dispatch]);

  const handleDismissEventNoPause = useCallback(() => {
    dispatch({ type: "dismiss_event_no_pause" });
  }, [dispatch]);

  const handleDismissRunSummary = useCallback(() => {
    setSummaryDismissedAtRun(state.totalRuns);
  }, [state.totalRuns]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Epoch</h1>
        <div className="header-buttons">
          <button
            className="header-btn"
            onClick={() => setSettingsOpen(true)}
          >
            Settings
          </button>
          <button
            className="header-btn"
            onClick={() => setLogOpen(true)}
          >
            Log
          </button>
          <button
            className="header-btn mobile-skills-btn"
            onClick={() => setSkillsOpen(true)}
          >
            Skills
          </button>
        </div>
      </header>

      <ResourceBar
        resources={state.run.resources}
        year={state.run.year}
        maxYear={state.run.maxYear}
        encounteredDisasters={state.encounteredDisasters}
      />

      <main className="app-main">
        <div className="main-queue">
          <QueuePanel state={state} dispatch={dispatch} />
        </div>
        <div className="main-sidebar">
          <SkillsPanel skills={state.skills} />
        </div>
      </main>

      {/* Event popup modal */}
      {pendingEvent && (
        <EventModal
          event={pendingEvent}
          autoDismiss={state.autoDismissEventTypes.includes(pendingEvent.eventId)}
          onDismiss={handleDismissEvent}
          onDismissNoPause={handleDismissEventNoPause}
        />
      )}

      {/* Run summary modal (collapse/victory) */}
      {showRunSummary && (state.run.status === "collapsed" || state.run.status === "victory") && (
        <RunSummaryModal
          run={state.run}
          skills={state.skills}
          skillsAtRunStart={state.skillsAtRunStart}
          lastRunYear={state.lastRunYear}
          totalRuns={state.totalRuns + 1}
          autoRestarting={state.run.status === "collapsed" && state.run.autoRestart}
          onDismiss={handleDismissRunSummary}
        />
      )}

      {/* Log modal */}
      {logOpen && (
        <LogModal log={state.run.log} runHistory={state.runHistory} totalRuns={state.totalRuns + 1} onClose={() => setLogOpen(false)} />
      )}

      {/* Skills modal for mobile */}
      {skillsOpen && (
        <div className="skills-modal-overlay" onClick={() => setSkillsOpen(false)}>
          <div className="skills-modal" onClick={(e) => e.stopPropagation()}>
            <div className="skills-modal-header">
              <h3>Skills <span className="skills-persist-tag">persist</span></h3>
              <button className="skills-modal-close" onClick={() => setSkillsOpen(false)}>
                ✕
              </button>
            </div>
            <SkillsPanel skills={state.skills} />
          </div>
        </div>
      )}

      {/* Settings modal */}
      {settingsOpen && (
        <SettingsPanel
          state={state}
          dispatch={dispatch}
          onClose={() => setSettingsOpen(false)}
          wakeLock={wakeLock}
        />
      )}
    </div>
  );
}

export default App;
