import type { Resources } from "../types/game.ts";
import { getActionDef } from "../types/actions.ts";

interface BuildingsTechsPanelProps {
  resources: Resources;
}

interface BuildingEntry {
  name: string;
  count: number;
  icon: string;
  color: string;
}

function getBuildings(resources: Resources): BuildingEntry[] {
  const buildings: BuildingEntry[] = [];
  const huts = Math.round((resources.maxPopulation - 5) / 3);
  if (huts > 0) {
    buildings.push({ name: "Hut", count: huts, icon: "\u{1F3D7}", color: "#9a8a72" });
  }
  if (resources.granariesBuilt > 0) {
    buildings.push({ name: "Granary", count: resources.granariesBuilt, icon: "\u{1F3D7}", color: "#9a8a72" });
  }
  if (resources.smokehousesBuilt > 0) {
    buildings.push({ name: "Smokehouse", count: resources.smokehousesBuilt, icon: "\u{1F3D7}", color: "#9a8a72" });
  }
  if (resources.barracksBuilt > 0) {
    buildings.push({ name: "Barracks", count: resources.barracksBuilt, icon: "\u{1F3D7}", color: "#b07070" });
  }
  if (resources.wallsBuilt > 0) {
    buildings.push({ name: "Wall", count: resources.wallsBuilt, icon: "\u{1F3D7}", color: "#9a8a72" });
  }
  return buildings;
}

export function BuildingsTechsPanel({ resources }: BuildingsTechsPanelProps) {
  const buildings = getBuildings(resources);
  const techs = resources.researchedTechs;

  if (buildings.length === 0 && techs.length === 0) return null;

  return (
    <div className="bt-panel">
      <h3>Buildings & Tech</h3>
      {buildings.length > 0 && (
        <div className="bt-section">
          <div className="bt-section-label">Buildings</div>
          <div className="bt-list">
            {buildings.map((b) => (
              <div key={b.name} className="bt-item">
                <span className="bt-item-dot" style={{ background: b.color }} />
                <span className="bt-item-name">{b.name}</span>
                {b.count > 1 && (
                  <span className="bt-item-count">{"\u00D7"}{b.count}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {techs.length > 0 && (
        <div className="bt-section">
          <div className="bt-section-label">Tech</div>
          <div className="bt-list">
            {techs.map((techId) => {
              const def = getActionDef(techId);
              return (
                <div key={techId} className="bt-item">
                  <span className="bt-item-dot" style={{ background: "#6a8faa" }} />
                  <span className="bt-item-name">{def?.name ?? techId}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Compact inline list for run history cards */
export function BuildingsTechsSummary({ resources }: BuildingsTechsPanelProps) {
  const buildings = getBuildings(resources);
  const techs = resources.researchedTechs;

  if (buildings.length === 0 && techs.length === 0) return null;

  return (
    <div className="run-history-section">
      <div className="run-history-section-label">Buildings & Tech</div>
      <div className="bt-summary-list">
        {buildings.map((b) => (
          <div key={b.name} className="bt-summary-chip bt-summary-building">
            <span className="bt-summary-name">{b.name}</span>
            {b.count > 1 && (
              <span className="bt-summary-count">{"\u00D7"}{b.count}</span>
            )}
          </div>
        ))}
        {techs.map((techId) => {
          const def = getActionDef(techId);
          return (
            <div key={techId} className="bt-summary-chip bt-summary-tech">
              <span className="bt-summary-name">{def?.name ?? techId}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
