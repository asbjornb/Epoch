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

## Deployment

GitHub Pages via GitHub Actions. Pushes to `main` trigger automatic builds and deploys. Base path is `/Epoch/`.
