import { useState, useCallback } from "react";
import { useGame, makeUid, getIncompatibleSave, clearIncompatibleSave } from "./hooks/useGame.ts";
import { useWakeLock } from "./hooks/useWakeLock.ts";
import { QueuePanel, ActionPalette } from "./components/QueuePanel.tsx";
import { ResourceBar } from "./components/ResourceBar.tsx";
import { SkillsPanel } from "./components/SkillsPanel.tsx";
import { EventModal } from "./components/EventModal.tsx";
import { WinterWinModal } from "./components/WinterWinModal.tsx";
import { TutorialToast } from "./components/TutorialToast.tsx";
import { RunSummaryModal } from "./components/RunSummaryModal.tsx";
import { LogModal } from "./components/LogModal.tsx";
import { SettingsPanel } from "./components/SettingsPanel.tsx";
import { IncompatibleSaveModal } from "./components/IncompatibleSaveModal.tsx";
import { HintButton } from "./components/HintButton.tsx";
import { BuildingsTechsPanel, getBuildings } from "./components/BuildingsTechsPanel.tsx";
import { UpdateBanner } from "./components/UpdateBanner.tsx";
import { getActionDef } from "./types/actions.ts";
import type { ActionId, QueueEntry } from "./types/game.ts";

function App() {
  const { state, dispatch } = useGame();
  const wakeLock = useWakeLock();
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [buildingsOpen, setBuildingsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [incompatibleSave, setIncompatibleSave] = useState<string | null>(getIncompatibleSave);

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

  // Separate tutorial events (persistent toasts) from regular events (modal)
  const tutorialEvents = state.run.pendingEvents.filter(e => e.eventId.startsWith("tutorial_"));
  const pendingEvent = state.run.pendingEvents.find(e => !e.eventId.startsWith("tutorial_")) ?? null;

  const handleDismissEvent = useCallback(() => {
    if (pendingEvent) {
      dispatch({ type: "dismiss_event_by_id", eventId: pendingEvent.eventId });
    }
  }, [dispatch, pendingEvent]);

  const handleDismissEventNoPause = useCallback(() => {
    if (pendingEvent) {
      dispatch({ type: "dismiss_event_no_pause_by_id", eventId: pendingEvent.eventId });
    }
  }, [dispatch, pendingEvent]);

  const handleDismissTutorial = useCallback((eventId: string) => {
    dispatch({ type: "dismiss_event_by_id", eventId });
  }, [dispatch]);

  const handleDismissRunSummary = useCallback(() => {
    dispatch({ type: "dismiss_summary" });
  }, [dispatch]);

  const handleDismissRunSummaryNoPause = useCallback(() => {
    dispatch({ type: "set_auto_dismiss_run_summary", value: true });
    dispatch({ type: "dismiss_summary" });
  }, [dispatch]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Epoch</h1>
        <HintButton state={state} />
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

      <UpdateBanner />

      <ResourceBar
        resources={state.run.resources}
        year={state.run.year}
        maxYear={state.run.maxYear}
        encounteredDisasters={state.encounteredDisasters}
      />

      <main className="app-main">
        <div className="main-actions">
          <ActionPalette state={state} onActionClick={handleActionClick} currentQueue={draftMode ? draftQueue : state.run.queue} />
          <BuildingsTechsPanel resources={state.run.resources} />
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

      {/* Mobile side toggle buttons */}
      <div className="mobile-side-toggles">
        <button
          className="side-drawer-toggle"
          onClick={() => setActionsOpen(true)}
          aria-label="Open actions"
        >
          <span className="side-drawer-toggle-icon">+</span>
          <span className="side-drawer-toggle-text">Actions</span>
        </button>
        {(getBuildings(state.run.resources).length > 0 || state.run.resources.researchedTechs.length > 0) && (
          <button
            className="side-drawer-toggle"
            onClick={() => setBuildingsOpen(true)}
            aria-label="Open buildings & tech"
          >
            <span className="side-drawer-toggle-icon">⌂</span>
            <span className="side-drawer-toggle-text">Housing</span>
          </button>
        )}
      </div>

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

      {/* Mobile buildings & tech drawer */}
      {buildingsOpen && (
        <div className="actions-drawer-overlay" onClick={() => setBuildingsOpen(false)}>
          <div className="actions-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="actions-drawer-header">
              <h3>Buildings & Tech</h3>
              <button className="actions-drawer-close" onClick={() => setBuildingsOpen(false)}>
                ✕
              </button>
            </div>
            <BuildingsTechsPanel resources={state.run.resources} />
          </div>
        </div>
      )}

      {/* Tutorial toasts (persistent, stacking) */}
      <TutorialToast events={tutorialEvents} onDismiss={handleDismissTutorial} />

      {/* Event popup modal */}
      {pendingEvent && (
        pendingEvent.eventId === "winter_end" && !state.autoDismissEventTypes.includes("winter_end") ? (
          <WinterWinModal
            event={pendingEvent}
            totalRuns={state.totalRuns + 1}
            onDismiss={handleDismissEvent}
          />
        ) : (
          <EventModal
            event={pendingEvent}
            autoDismiss={state.autoDismissEventTypes.includes(pendingEvent.eventId)}
            onDismiss={handleDismissEvent}
            onDismissNoPause={handleDismissEventNoPause}
          />
        )
      )}

      {/* Run summary modal (collapse/victory) */}
      {state.endedRunSnapshot && (
        <RunSummaryModal
          run={state.endedRunSnapshot.run}
          skills={state.endedRunSnapshot.skills}
          skillsAtRunStart={state.endedRunSnapshot.skillsAtRunStart}
          lastRunYear={state.endedRunSnapshot.lastRunYear}
          totalRuns={state.endedRunSnapshot.totalRuns}
          autoRestarting={state.endedRunSnapshot.run.status === "collapsed" && state.endedRunSnapshot.run.autoRestart}
          autoDismiss={state.autoDismissRunSummary}
          onDismiss={handleDismissRunSummary}
          onDismissNoPause={handleDismissRunSummaryNoPause}
        />
      )}

      {/* Log modal */}
      {logOpen && (
        <LogModal log={state.run.log} runHistory={state.runHistory} totalRuns={state.totalRuns} bestRunYear={state.bestRunYear} totalYearsPlayed={state.totalYearsPlayed} achievements={state.achievements} onClose={() => setLogOpen(false)} />
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

      {/* Incompatible save modal */}
      {incompatibleSave && (
        <IncompatibleSaveModal
          saveJson={incompatibleSave}
          onDismiss={() => {
            clearIncompatibleSave();
            setIncompatibleSave(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
