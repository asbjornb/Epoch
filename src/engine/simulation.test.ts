import { describe, it, expect } from "vitest";
import { tick, createInitialRun, getTotalDefense } from "./simulation.ts";
import { initialSkills } from "./skills.ts";
import type { GameState } from "../types/game.ts";

function createGameState(overrides?: Partial<GameState>): GameState {
  return {
    skills: initialSkills(),
    run: createInitialRun(),
    totalRuns: 0,
    totalWinterYearsSurvived: 0,
    unlockedActions: ["farm"],
    encounteredDisasters: [],
    seenEventTypes: [],
    autoDismissEventTypes: [],
    autoDismissRunSummary: false,
    lastRunYear: 0,
    skillsAtRunStart: initialSkills(),
    runHistory: [],
    endedRunSnapshot: null,
    ...overrides,
  };
}

describe("raider defense", () => {
  it("farming-only run collapses at raider year", () => {
    let state = createGameState();
    state.run.status = "running";
    state.run.queue = [{ uid: "1", actionId: "farm", repeat: -1 }];

    // Advance to just before raider year (1500)
    for (let i = 0; i < 1499; i++) {
      state = tick(state);
      // Should still be running (or paused by event, but not collapsed)
      if (state.run.status !== "running") {
        // Could starve — that's a different failure. Skip this test.
        expect.fail(
          `Run ended before raiders at year ${state.run.year}: ${state.run.status} — ${state.run.collapseReason}`,
        );
      }
    }

    // Verify no military strength from farming
    expect(state.run.resources.militaryStrength).toBe(0);
    expect(getTotalDefense(state.run.resources)).toBe(0);

    // Tick into raider year — should collapse
    state = tick(state);
    expect(state.run.year).toBe(1500);
    expect(state.run.status).toBe("collapsed");
    expect(state.run.collapseReason).toContain("Raiders attacked");
    expect(state.run.collapseReason).toContain("Total defense 0");
  });

  it("getTotalDefense returns 0 (not NaN) with default resources", () => {
    const { resources } = createInitialRun();
    const defense = getTotalDefense(resources);
    expect(defense).toBe(0);
    expect(Number.isNaN(defense)).toBe(false);
  });
});
