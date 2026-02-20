import { useState, useCallback } from "react";
import { useGame, makeUid } from "./hooks/useGame.ts";
import { useWakeLock } from "./hooks/useWakeLock.ts";
import { QueuePanel, ActionPalette } from "./components/QueuePanel.tsx";
import { ResourceBar } from "./components/ResourceBar.tsx";
import { SkillsPanel } from "./components/SkillsPanel.tsx";
import { EventModal } from "./components/EventModal.tsx";
import { RunSummaryModal } from "./components/RunSummaryModal.tsx";
import { LogModal } from "./components/LogModal.tsx";
import { SettingsPanel } from "./components/SettingsPanel.tsx";
import { getActionDef } from "./types/actions.ts";
import type { ActionId, QueueEntry } from "./types/game.ts";

function App() {
  const { state, dispatch } = useGame();
  const wakeLock = useWakeLock();
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [summaryDismissedAtRun, setSummaryDismissedAtRun] = useState(-1);

  // Draft queue state
  const [draftMode, setDraftMode] = useState(false);
  const [draftQueue, setDraftQueue] = useState<QueueEntry[]>([]);
  const [draftRepeatLast, setDraftRepeatLast] = useState(true);

  const handleActionClick = useCallback((actionId: ActionId) => {
    if (draftMode) {
      const def = getActionDef(actionId);
      // Research techs are single-use: don't add if already in draft queue
      if (def?.category === "research") {
        setDraftQueue((prev) => {
          if (prev.some((e) => e.actionId === actionId)) return prev;
          return [...prev, { uid: makeUid(), actionId, repeat: 1 }];
        });
      } else {
        setDraftQueue((prev) => [...prev, { uid: makeUid(), actionId, repeat: 1 }]);
      }
    } else {
      dispatch({ type: "queue_add", actionId });
    }
  }, [draftMode, dispatch]);

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
        <div className="main-actions">
          <ActionPalette state={state} onActionClick={handleActionClick} currentQueue={draftMode ? draftQueue : state.run.queue} />
        </div>
        <div className="main-queue">
          <QueuePanel
            state={state}
            dispatch={dispatch}
            draftMode={draftMode}
            onDraftModeChange={setDraftMode}
            draftQueue={draftQueue}
            onDraftQueueChange={setDraftQueue}
            draftRepeatLast={draftRepeatLast}
            onDraftRepeatLastChange={setDraftRepeatLast}
          />
        </div>
        <div className="main-sidebar">
          <SkillsPanel skills={state.skills} />
        </div>
      </main>

      {/* Mobile actions drawer toggle */}
      <button
        className="actions-drawer-toggle"
        onClick={() => setActionsOpen(true)}
        aria-label="Open actions"
      >
        <span className="actions-drawer-toggle-icon">+</span>
        <span className="actions-drawer-toggle-text">Actions</span>
      </button>

      {/* Mobile actions drawer */}
      {actionsOpen && (
        <div className="actions-drawer-overlay" onClick={() => setActionsOpen(false)}>
          <div className="actions-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="actions-drawer-header">
              <h3>Actions</h3>
              <button className="actions-drawer-close" onClick={() => setActionsOpen(false)}>
                ✕
              </button>
            </div>
            <ActionPalette state={state} onActionClick={handleActionClick} currentQueue={draftMode ? draftQueue : state.run.queue} />
          </div>
        </div>
      )}

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
        <LogModal log={state.run.log} runHistory={state.runHistory} totalRuns={state.totalRuns} onClose={() => setLogOpen(false)} />
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
