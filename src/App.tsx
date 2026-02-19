import { useState } from "react";
import { useGame } from "./hooks/useGame.ts";
import { QueuePanel } from "./components/QueuePanel.tsx";
import { ResourceBar } from "./components/ResourceBar.tsx";
import { SkillsPanel } from "./components/SkillsPanel.tsx";
import { Controls } from "./components/Controls.tsx";
import { EventLog } from "./components/EventLog.tsx";

function App() {
  const { state, dispatch } = useGame();
  const [skillsOpen, setSkillsOpen] = useState(false);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Epoch</h1>
        <span className="app-subtitle">Civilization Loop Strategy</span>
        <button
          className="mobile-skills-btn"
          onClick={() => setSkillsOpen(true)}
        >
          Skills
        </button>
      </header>

      <ResourceBar
        resources={state.run.resources}
        year={state.run.year}
        maxYear={state.run.maxYear}
        encounteredDisasters={state.encounteredDisasters}
      />

      <Controls
        run={state.run}
        totalRuns={state.totalRuns}
        dispatch={dispatch}
      />

      <main className="app-main">
        <div className="main-queue">
          <QueuePanel state={state} dispatch={dispatch} />
        </div>
        <div className="main-sidebar">
          <SkillsPanel skills={state.skills} />
          <EventLog log={state.run.log} />
        </div>
      </main>

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
    </div>
  );
}

export default App;
