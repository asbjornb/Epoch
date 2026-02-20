import { useState, useRef, useEffect } from "react";
import type { Resources, DisasterInfo } from "../types/game.ts";
import { DISASTERS } from "../engine/simulation.ts";

interface ResourceBarProps {
  resources: Resources;
  year: number;
  maxYear: number;
  encounteredDisasters: string[];
}

export function ResourceBar({ resources, year, maxYear, encounteredDisasters }: ResourceBarProps) {
  const yearPct = (year / maxYear) * 100;

  const knownDisasters = DISASTERS.filter((d) => encounteredDisasters.includes(d.id));
  const nextDisaster = knownDisasters
    .filter((d) => d.year > year)
    .sort((a, b) => a.year - b.year)[0] ?? null;

  return (
    <div className="resource-bar">
      {/* Desktop year display */}
      <div className="year-display year-desktop">
        <span className="year-label">Year</span>
        <span className="year-value">{year.toLocaleString()}</span>
        <div className="year-progress-track">
          <div className="year-progress-fill" style={{ width: `${yearPct}%` }} />
          <div className="year-marker raider" style={{ left: "20%" }} title="Raider Era (Y2000)" />
          <div className="year-marker winter" style={{ left: "50%" }} title="Great Cold (Y5000)" />
        </div>
      </div>

      {/* Mobile year display */}
      <MobileYearDisplay
        year={year}
        nextDisaster={nextDisaster}
        knownDisasters={knownDisasters}
      />

      <div className="resources">
        <ResourceItem
          label="Food"
          value={Math.floor(resources.food)}
          icon="🌾"
          color="#6a8f5c"
          extra={`/ ${Math.floor(resources.foodStorage)}`}
        />
        <ResourceItem
          label="Pop"
          value={resources.population}
          icon="👥"
          color="#968e82"
          extra={`/ ${resources.maxPopulation}`}
        />
        {resources.wood > 0 && (
          <ResourceItem label="Wood" value={Math.floor(resources.wood)} icon="🪵" color="#9a8a72" />
        )}
        {resources.militaryStrength + resources.wallDefense > 0 && (
          <ResourceItem
            label="Defense"
            value={Math.floor(resources.militaryStrength + resources.wallDefense)}
            icon="⚔"
            color="#b07070"
            extra={resources.wallDefense > 0 ? `(${Math.floor(resources.militaryStrength)}+${Math.floor(resources.wallDefense)})` : undefined}
          />
        )}
        {resources.researchedTechs.length > 0 && (
          <ResourceItem
            label="Tech"
            value={resources.researchedTechs.length}
            icon="🔬"
            color="#6a8faa"
          />
        )}
      </div>
    </div>
  );
}

function MobileYearDisplay({
  year,
  nextDisaster,
  knownDisasters,
}: {
  year: number;
  nextDisaster: DisasterInfo | null;
  knownDisasters: DisasterInfo[];
}) {
  const [showPopup, setShowPopup] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPopup) return;
    function handleClickOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setShowPopup(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPopup]);

  return (
    <div className="year-display year-mobile" ref={popupRef}>
      <button
        className="mobile-year-btn"
        onClick={() => knownDisasters.length > 0 && setShowPopup((v) => !v)}
      >
        <span className="year-label">Year</span>
        <span className="year-value">{year.toLocaleString()}</span>
        {nextDisaster && (
          <span className="mobile-next-disaster" style={{ color: nextDisaster.color }}>
            {nextDisaster.name} Y{nextDisaster.year.toLocaleString()}
          </span>
        )}
        {knownDisasters.length > 0 && (
          <span className="mobile-year-chevron">{showPopup ? "▲" : "▼"}</span>
        )}
      </button>

      {showPopup && knownDisasters.length > 0 && (
        <div className="disaster-popup">
          <div className="disaster-popup-title">Known Disasters</div>
          {knownDisasters.map((d) => (
            <div
              key={d.id}
              className={`disaster-popup-item ${year >= d.year ? "past" : ""}`}
            >
              <span className="disaster-popup-dot" style={{ background: d.color }} />
              <span className="disaster-popup-name">{d.name}</span>
              <span className="disaster-popup-year">Y{d.year.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
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
