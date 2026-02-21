# CLAUDE.md

## Build & Run

```bash
npm run dev        # Start local dev server
npm run build      # TypeScript check + Vite production build (outputs to dist/)
npm run lint       # Run ESLint
npm run preview    # Preview production build locally
```

## Tech Stack

- TypeScript (strict mode), React 19, Vite 7
- No test framework configured

## Project Structure

- `src/components/` - React UI components (Controls, QueuePanel, ResourceBar, SkillsPanel, EventLog)
- `src/engine/` - Game simulation logic (simulation.ts for tick/events, skills.ts for progression)
- `src/hooks/` - Custom React hooks (useGame.ts manages all game state)
- `src/types/` - TypeScript type definitions (game state, action definitions)

## Compatibility

No current users. Backwards compatibility is not required until v1.

## Content & Spoilers

Hints, tooltips, and UI text should not spoil content the player hasn't unlocked yet. Avoid revealing specific unlock levels, action names, or event details before the player discovers them naturally. Keep hints vague and encouraging (e.g. "Raising your Building skill might unlock new options" instead of "Raise Building to level 2 to unlock Build Hut").

## Deployment

GitHub Pages via GitHub Actions. Pushes to `main` trigger automatic builds and deploys. Base path is `/Epoch/`.
