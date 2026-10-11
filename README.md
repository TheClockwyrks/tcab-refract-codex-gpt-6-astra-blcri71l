# Refract

Draw beams of light across a dark optical bench. Connect each channel’s two outlined emitters, thread all its filled lenses, and spend every charge in the shared crystals. The board is complete when every channel and crystal is satisfied.

Campaign offers 24 fixed puzzles in four sets. Cascade generates an endless sequence across five difficulty tiers, advancing every five solves. Progress lasts for the current session.

## Run locally

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Everything runs in the browser; the game needs no account, backend, external assets, or network services.

## Build the static site

```sh
npm run build
npm run preview
```

The complete production site is in `dist/`. Serve that directory at the root of any static web server.

## Controls

- **Mouse, pen, or touch:** press an outlined emitter and drag between neighboring nodes, including diagonals. Release to keep the beam.
- **Edit:** grab either end to continue, grab an unshared interior node to shorten, or trace backward to undo the last segment.
- **R:** clear the current board.
- **Arrow keys / WASD:** navigate menus and the campaign grid.
- **Enter / Space:** accept a choice.
- **Escape:** go back.
- **M:** toggle sound.
- **Backtick:** toggle the engine’s diagnostic overlay.

All screen controls also work with the pointer. Disallowed moves leave the beam intact. Beams cannot reuse a segment or cross diagonals, and each channel can touch only its own emitters and lenses. Crystals are neutral: their `spent / total` readout updates on entry, and each crossing must be finished by leaving again.

## Development and verification

```sh
npx tsc --noEmit
npx eslint .
npx prettier --check .
npx vitest run --coverage
```

The Simple 2D engine owns input, timing, audio, canvas fitting, diagnostics, and recording. The simulation is immutable and independent of rendering. Tests run the engine with a counted clock and a native canvas, drive both real input samples and its debug API, and verify progression and beam rules.

Cascade independently samples its tier’s dimensions, selects a certified seed, and proposes random changes to nodes and charges. An exhaustive route solver checks each proposal’s solution count, channel alternatives, determined share, branching factor, and shared crystals. Searches have a work budget; an inconclusive search rejects the proposal. The certified seed remains available so generation always terminates. The test suite also independently re-enumerates every shipped seed.

`engine.debug` provides the version 2 automation surface. Call poses through `engine.apply(s => engine.debug.loadBoard(s, ["TtT"]))` and read `engine.debug.snapshot(engine.state)`. The game installs no global debug object.

The `showcase/` directory contains a player description, browser screenshots, and an engine-recorded replay of live tracing.
