import { useGame } from "./hooks/useGame.ts";
import { QueuePanel } from "./components/QueuePanel.tsx";
import { ResourceBar } from "./components/ResourceBar.tsx";
import { SkillsPanel } from "./components/SkillsPanel.tsx";
import { Controls } from "./components/Controls.tsx";
import { EventLog } from "./components/EventLog.tsx";

function App() {
  const { state, dispatch } = useGame();

  return (
    <div className="app">
      <header className="app-header">
        <h1>Epoch</h1>
        <span className="app-subtitle">Civilization Loop Strategy</span>
      </header>

      <ResourceBar
        resources={state.run.resources}
        year={state.run.year}
        maxYear={state.run.maxYear}
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
    </div>
  );
}

export default App;
