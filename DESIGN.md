# Epoch -- Civilization Loop Strategy Game

## 1. Vision

Epoch is a deterministic, time-based civilization optimization game inspired by
worker placement board games (e.g., Agricola) and loop-based progression games
(e.g., Idle Loops, Increlution).

The player acts as a guiding force attempting to help a civilization survive
through a fixed historical cycle. Each run represents one civilization attempt.

- Infrastructure is lost between runs.
- Skills improve permanently.
- The long-term goal is to overcome successive civilization gates (Ice Age,
  Raiders, Collapse, etc.).

## 2. Core Pillars

- **Time is Scarce**
- **Food is Pressure**
- **Collapse is Inevitable** (Until It Isn't)
- **Skill Improves Through Use**
- **Optimization Across Runs**

## 3. Core Mechanics

### 3.1 Time System

- 1 tick = 1 year
- Civilization cycle length (V1): 10,000 years
- Player builds a queue of actions
- Actions consume multiple ticks (multi-year tasks), but may provide benefits
  each tick

**Example:**

> Farm (100 years) -- progress bar fills over 100 ticks, but food is awarded
> each tick.

### 3.2 Skills (Persistent Across Runs)

Skills increase based on action usage.

**V1 Skills:**

- Farming
- Building
- Research
- Military

**Skill Effects:**

- Reduce action duration
- Improve action output
- Unlock new actions at certain levels
- Improve action efficiency

Skill progression is nonlinear.

**Example:**

| Farming Level | Years per Farm Action |
|---------------|----------------------|
| 1             | 100                  |
| 10            | 85                   |
| 50            | 40                   |
| 100           | 10                   |

Each level takes more XP to reach than the last.

### 3.3 Resources (Reset Each Run)

- Food
- Population
- Different Materials (unlocked over time)
- Military Strength (may require dedicated population to become non-trivial)

Only skills persist between runs.

### 3.4 Food Pressure

- Each population unit consumes food per year
- If food runs out, population declines
- Farming generates food
- Storage buildings and technology determine spoilage, but initially with only
  farming actions food production will equal food consumption so no storage is
  needed
- Food must be actively managed to survive

### 3.5 Population

- Population grows slowly when food surplus exists
- Population:
  - Increases food demand
  - Enables military training
  - Improves output from all actions
- Population resets each run

### 3.6 Queue System

Player constructs a queue of actions before or during a run.

**Features:**

- Add / remove / reorder actions
- Save named queue templates
- By default repeats last queue action until collapse

**Future versions might add:**

- Conditional loops
- Repeat-until logic

## 4. Civilization Gates (Chapter System)

Each cycle contains milestone checks.

### V1 Gates

**Gate 1: Raider Era (Year 2000)**

- If military strength too low: **Collapse** -- skills persist, restart
- If sufficient military: minor bonus, military XP bonus

**Gate 2: The Great Cold (Year 5000)**

Winter event:

- Farming disabled
- High food consumption
- Requires food stockpile + storage
- Generally everyone will die at this gate for a long time until better
  technology allows minor food gain during winter or better conservation of
  copious amounts of food

If survive: **Run Victory**

If fail: **Collapse** -- skills persist, restart

(Later versions will have more epoch chapters.)

## 5. Run Flow

```
Start Run
    |
Queue Actions
    |
Time Advances
    |
Manage Food + Population
    |
Handle Raider Event
    |
Prepare for Winter
    |
Survive or Collapse
    |
Skills Increase
    |
New Run Begins
```

By default on collapse a new run plays automatically so players can idle to
improve skills. A setting should exist to stop the loop after each collapse for
players who want to optimize run count. Some might want to play actions manually,
but most should use the queue. The default is: queue + repeat last action until
collapse + restart on collapse.

## 6. Long-Term Structure

Each completed Epoch unlocks a new Chapter:

- Nomadic Age
- Agricultural Age
- Bronze Age
- Industrial Age
- Climate Collapse Era
- Interplanetary Age

Each chapter:

- Adds new skills
- Adds new collapse types
- Changes the optimization puzzle

## 7. Win Conditions

- **V1:** Survive the Great Cold
- **Long-term:** Survive all Epoch chapters

## 8. UI Principles

- Minimalist
- Deterministic
- Clear time projection
- Visible collapse clock
- Visible food pressure
- Clean queue editor
- No map
- No tile placement
- Focus is time optimization
- It is a time allocation puzzle with meta progression

## 9. Platform Strategy

- **Phase 1:** Web (HTML/CSS/JS) -- mobile-friendly responsive design, playable
  on both mobile and desktop browsers
- **Phase 2:** Dedicated native apps (e.g., via Capacitor or similar) wrapping
  the web build

## 10. V1 Scope Constraints

### Must Include

- 5 skills
- 6-8 actions
- 1 raider event
- 1 winter event
- Persistent skill saving
- Queue save/load

### Must NOT Include

- Random maps
- Relics
- Diplomacy
- Pollution systems
- Complex UI

Keep it tight.

## 11. Design Goals

- **Early runs:** Barely survive
- **Mid runs:** Repel raiders, build modest infrastructure
- **Late runs:** Strategically route civilization to survive winter
- **Final feeling:** "I almost had it. One more optimized run."
