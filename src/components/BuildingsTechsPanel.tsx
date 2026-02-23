import { useState } from "react";
import type { Resources } from "../types/game.ts";
import { getActionDef } from "../types/actions.ts";
import { getBuildingCount } from "../engine/simulation.ts";

interface BuildingsTechsPanelProps {
  resources: Resources;
  defaultCollapsed?: boolean;
}

interface BuildingEntry {
  name: string;
  count: number;
  color: string;
}

export function getBuildings(resources: Resources): BuildingEntry[] {
  const buildings: BuildingEntry[] = [];
  const huts = getBuildingCount(resources, "build_hut");
  if (huts > 0) {
    buildings.push({ name: "Hut", count: huts, color: "#9a8a72" });
  }
  const granaries = getBuildingCount(resources, "build_granary");
  if (granaries > 0) {
    buildings.push({ name: "Granary", count: granaries, color: "#9a8a72" });
  }
  const smokehouses = getBuildingCount(resources, "build_smokehouse");
  if (smokehouses > 0) {
    buildings.push({ name: "Smokehouse", count: smokehouses, color: "#9a8a72" });
  }
  const barracks = getBuildingCount(resources, "build_barracks");
  if (barracks > 0) {
    buildings.push({ name: "Barracks", count: barracks, color: "#b07070" });
  }
  const walls = getBuildingCount(resources, "build_wall");
  if (walls > 0) {
    buildings.push({ name: "Wall", count: walls, color: "#9a8a72" });
  }
  return buildings;
}

export function BuildingsTechsPanel({ resources, defaultCollapsed = false }: BuildingsTechsPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const buildings = getBuildings(resources);
  const techs = resources.researchedTechs;

  if (buildings.length === 0 && techs.length === 0) return null;

  const totalCount = buildings.reduce((s, b) => s + b.count, 0) + techs.length;

  return (
    <div className={`bt-panel ${collapsed ? "bt-panel-collapsed" : ""}`}>
      <button className="bt-panel-header" onClick={() => setCollapsed(c => !c)}>
        <span className="bt-panel-title">Buildings & Tech</span>
        {collapsed && <span className="bt-panel-badge">{totalCount}</span>}
        <span className={`bt-panel-chevron ${collapsed ? "" : "bt-panel-chevron-open"}`}>&#x25B8;</span>
      </button>
      {!collapsed && (
        <div className="bt-panel-body">
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
