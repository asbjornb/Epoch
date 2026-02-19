import type { Resources } from "../types/game.ts";

interface ResourceBarProps {
  resources: Resources;
  year: number;
  maxYear: number;
}

export function ResourceBar({ resources, year, maxYear }: ResourceBarProps) {
  const yearPct = (year / maxYear) * 100;

  return (
    <div className="resource-bar">
      <div className="year-display">
        <span className="year-label">Year</span>
        <span className="year-value">{year.toLocaleString()}</span>
        <div className="year-progress-track">
          <div className="year-progress-fill" style={{ width: `${yearPct}%` }} />
          <div className="year-marker raider" style={{ left: "20%" }} title="Raider Era (Y2000)" />
          <div className="year-marker winter" style={{ left: "50%" }} title="Great Cold (Y5000)" />
        </div>
      </div>
      <div className="resources">
        <ResourceItem
          label="Food"
          value={Math.floor(resources.food)}
          icon="🌾"
          color="#4a7c3f"
          extra={`/ ${Math.floor(resources.foodStorage)}`}
        />
        <ResourceItem
          label="Pop"
          value={resources.population}
          icon="👥"
          color="#5a6a7a"
          extra={`/ ${resources.maxPopulation}`}
        />
        <ResourceItem label="Materials" value={Math.floor(resources.materials)} icon="🪨" color="#8b6914" />
        <ResourceItem
          label="Defense"
          value={Math.floor(resources.militaryStrength + resources.wallDefense)}
          icon="⚔"
          color="#8a3a3a"
          extra={resources.wallDefense > 0 ? `(${Math.floor(resources.militaryStrength)}+${Math.floor(resources.wallDefense)})` : undefined}
        />
        {resources.techLevel > 0 && (
          <ResourceItem
            label="Tech"
            value={resources.techLevel}
            icon="🔬"
            color="#3a5f8a"
            extra={`+${resources.techLevel * 10}%`}
          />
        )}
      </div>
    </div>
  );
}

function ResourceItem({
  label,
  value,
  icon,
  color,
  extra,
}: {
  label: string;
  value: number;
  icon: string;
  color: string;
  extra?: string;
}) {
  return (
    <div className="resource-item" style={{ borderBottomColor: color }}>
      <span className="resource-icon">{icon}</span>
      <span className="resource-value">
        {value}
        {extra && <span className="resource-extra">{extra}</span>}
      </span>
      <span className="resource-label">{label}</span>
    </div>
  );
}
