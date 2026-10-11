import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";

export type Screen =
  "title" | "howto" | "select" | "playing" | "solved" | "complete";

export type Mode = "campaign" | "cascade";

export type Channel = "triangle" | "square" | "diamond";

export type NodeKind = "emitter" | "lens" | "crystal";

export interface Cell {
  readonly col: number;
  readonly row: number;
}

export interface NodeState {
  readonly col: number;
  readonly row: number;
  readonly kind: NodeKind;
  readonly channel: Channel | null;
  readonly charges: number | null;
}

export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly nodes: readonly NodeState[];
}

export interface BeamState {
  readonly channel: Channel;
  readonly cells: readonly Cell[];
}

export interface TraceState {
  readonly channel: Channel;
}

export type PointerDevice = "mouse" | "pen" | "touch";

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}

export interface RefractState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;

  readonly board: BoardState;
  readonly beams: readonly BeamState[];
  readonly tracing: TraceState | null;

  readonly boardIndex: number;
  readonly solvedBoards: readonly number[];
  readonly unlockedCount: number;
  readonly selectIndex: number;

  readonly solvedCount: number;
  readonly tier: number;

  readonly pointer: PointerState;
  readonly armedTarget: string | null;
  readonly simTime: number;
  readonly muted: boolean;
}

import {
  ACTIONS,
  BINDINGS,
  CAMPAIGN_LENGTH,
  CHANNELS,
  CUES,
  GRID_MAX_ROWS,
  MAX_TIER,
  NODE_HIT_R,
  REFRACT_DEBUG_VERSION,
  SET_LABELS,
  SOLVED_ITEMS,
  TARGET_MIN_H,
  TARGET_MIN_W,
  TIER_ADVANCE,
  TITLE_ITEMS,
} from "./constants";
import { CAMPAIGN, SET_SIZE } from "./campaign";
import {
  canExtend,
  cellX,
  cellY,
  complete,
  emptyBeams,
  parseBoard,
  same,
  solved,
  spent,
} from "./rules";
import { generate } from "./generator";
import { draw } from "./render";

export const BACKGROUND = "#080f18";
type State = DeepReadonly<RefractState>;
export interface Target {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export interface RefractDebugApi {
  readonly version: number;
  reset(s: State): RefractState;
  snapshot(s: State): ReturnType<typeof snapshot>;
  reconcile(s: State): RefractState;
  setMode(s: State, mode: Mode): RefractState;
  setScreen(s: State, screen: Screen): RefractState;
  setMenuIndex(s: State, index: number): RefractState;
  setSolvedCount(s: State, count: number): RefractState;
  setTier(s: State, tier: number): RefractState;
  generateBoard(s: State, tier: number): RefractState;
  loadBoard(s: State, board: readonly string[]): RefractState;
  pointerDown(
    s: State,
    x: number,
    y: number,
    device?: PointerDevice,
  ): RefractState;
  pointerMove(
    s: State,
    x: number,
    y: number,
    device?: PointerDevice,
  ): RefractState;
  pointerUp(s: State, device?: PointerDevice): RefractState;
  clear(s: State): RefractState;
}
export function initial(muted = false): RefractState {
  return {
    screen: "title",
    mode: "campaign",
    menuIndex: 0,
    board: { cols: 0, rows: 0, nodes: [] },
    beams: [],
    tracing: null,
    boardIndex: 0,
    solvedBoards: [],
    unlockedCount: 1,
    selectIndex: 0,
    solvedCount: 0,
    tier: 1,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    armedTarget: null,
    simTime: 0,
    muted,
  };
}
export function menuItems(s: State): readonly string[] {
  if (s.screen === "title") return TITLE_ITEMS;
  if (s.screen === "complete") return ["BOARD SELECT", "MAIN MENU"];
  if (s.screen !== "solved") return [];
  if (s.mode === "cascade") return SOLVED_ITEMS;
  return [
    ...(s.boardIndex < CAMPAIGN_LENGTH - 1 ? ["NEXT BOARD"] : []),
    "REPLAY",
    "BOARD SELECT",
  ];
}
export function targets(s: State): Target[] {
  const back = {
    id: "back",
    x: 48,
    y: 40,
    w: TARGET_MIN_W + 24,
    h: TARGET_MIN_H,
  };
  if (s.screen === "howto") return [back];
  if (s.screen === "playing")
    return [{ id: "clear", x: 1092, y: 570, w: 140, h: TARGET_MIN_H }, back];
  if (s.screen === "select")
    return [
      ...Array.from({ length: CAMPAIGN_LENGTH }, (_, i) => ({
        id: `board-${i + 1}`,
        x: 258 + (i % SET_SIZE) * 124,
        y: 220 + Math.floor(i / SET_SIZE) * 98,
        w: 108,
        h: 80,
      })),
      back,
    ];
  const title = s.screen === "title";
  return menuItems(s).map((_, i) => ({
    id: `menu-${i}`,
    x: title ? 100 : 972,
    y: (title ? 350 : 318) + i * 86,
    w: title ? 366 : 260,
    h: TARGET_MIN_H,
  }));
}
export function snapshot(s: State) {
  const beam = s.beams.find((b) => b.channel === s.tracing?.channel);
  return {
    version: REFRACT_DEBUG_VERSION,
    screen: s.screen,
    mode: s.mode,
    menuIndex: s.menuIndex,
    boardIndex: s.boardIndex,
    solvedBoards: [...s.solvedBoards],
    unlockedCount: s.unlockedCount,
    selectIndex: s.selectIndex,
    solvedCount: s.solvedCount,
    tier: s.tier,
    board: {
      cols: s.board.cols,
      rows: s.board.rows,
      nodes: s.board.nodes.map((n) => ({
        ...n,
        x: cellX(n.col, s.board.cols),
        y: cellY(n.row, s.board.rows),
        spent: n.kind === "crystal" ? spent(s.beams, n) : null,
      })),
    },
    beams: Object.fromEntries(
      s.beams.map((b) => [
        b.channel,
        {
          cells: b.cells.map((c) => ({ ...c })),
          complete: complete(s.board, b),
        },
      ]),
    ),
    solved: solved(s),
    tracing:
      s.tracing && beam
        ? {
            channel: s.tracing.channel,
            live: { ...beam.cells[beam.cells.length - 1] },
          }
        : null,
    pointer: { ...s.pointer },
    targets: targets(s),
    muted: s.muted,
    simTime: s.simTime,
  };
}
export function poseBoard(s: State, board: BoardState): RefractState {
  return {
    ...s,
    board,
    beams: emptyBeams(board),
    tracing: null,
    screen: "playing",
    armedTarget: null,
  };
}
function enterCampaign(s: State, index: number): RefractState {
  return {
    ...poseBoard(s, parseBoard(CAMPAIGN[index])),
    boardIndex: index,
    selectIndex: index,
    menuIndex: 0,
  };
}
const changeScreen = (
  s: State,
  screen: Screen,
  menuIndex = 0,
): RefractState => ({
  ...s,
  screen,
  menuIndex,
  armedTarget: null,
  tracing: null,
});
export const clear = (s: State): RefractState => ({
  ...s,
  beams: emptyBeams(s.board),
  tracing: null,
});
function select(s: State): RefractState {
  return { ...changeScreen(s, "select"), selectIndex: s.boardIndex };
}
export function action(s: State, key: string): RefractState {
  if (key === "clear") return s.screen === "playing" ? clear(s) : s;
  if (key === "back") {
    if (s.screen === "title") return s;
    if (s.screen === "howto") return changeScreen(s, "title", 2);
    if (s.screen === "select") return changeScreen(s, "title", 0);
    const leaving = s.screen === "playing" ? clear(s) : s;
    return s.mode === "campaign"
      ? select(leaving)
      : changeScreen(leaving, "title", 1);
  }
  if (s.screen === "select") {
    const row = Math.floor(s.selectIndex / SET_SIZE),
      col = s.selectIndex % SET_SIZE;
    if (key === "left" || key === "right")
      return {
        ...s,
        selectIndex:
          row * SET_SIZE +
          ((col + (key === "left" ? SET_SIZE - 1 : 1)) % SET_SIZE),
      };
    if (key === "up" || key === "down")
      return {
        ...s,
        selectIndex:
          ((row + (key === "up" ? SET_LABELS.length - 1 : 1)) %
            SET_LABELS.length) *
            SET_SIZE +
          col,
      };
    if (key === "confirm" && s.selectIndex < s.unlockedCount)
      return enterCampaign(s, s.selectIndex);
    return s;
  }
  const items = menuItems(s);
  if (!items.length) return s;
  if (key === "up" || key === "down")
    return {
      ...s,
      menuIndex:
        (s.menuIndex + items.length + (key === "up" ? -1 : 1)) % items.length,
    };
  if (key !== "confirm") return s;
  if (s.screen === "title") {
    if (s.menuIndex === 0) return select({ ...s, mode: "campaign" });
    if (s.menuIndex === 1)
      return {
        ...poseBoard(s, generate(1)),
        mode: "cascade",
        solvedCount: 0,
        tier: 1,
        menuIndex: 0,
      };
    return changeScreen(s, "howto");
  }
  if (s.screen === "complete")
    return s.menuIndex === 0 ? select(s) : changeScreen(s, "title", 0);
  if (s.mode === "cascade") {
    const restart = s.menuIndex === 1;
    return {
      ...poseBoard(s, generate(restart ? 1 : s.tier)),
      solvedCount: restart ? 0 : s.solvedCount,
      tier: restart ? 1 : s.tier,
      menuIndex: 0,
    };
  }
  const label = items[s.menuIndex];
  if (label === "NEXT BOARD") return enterCampaign(s, s.boardIndex + 1);
  if (label === "REPLAY") return enterCampaign(s, s.boardIndex);
  return select(s);
}
function finish(s: State): RefractState {
  if (s.screen !== "playing" || !solved(s)) return s;
  if (s.mode === "cascade") {
    const solvedCount = s.solvedCount + 1;
    return {
      ...changeScreen(s, "solved"),
      solvedCount,
      tier: Math.min(Math.floor(solvedCount / TIER_ADVANCE) + 1, MAX_TIER),
    };
  }
  const solvedBoards = [...new Set([...s.solvedBoards, s.boardIndex])].sort(
    (a, b) => a - b,
  );
  return {
    ...changeScreen(
      s,
      solvedBoards.length === CAMPAIGN_LENGTH ? "complete" : "solved",
    ),
    solvedBoards,
    unlockedCount: s.solvedBoards.includes(s.boardIndex)
      ? s.unlockedCount
      : Math.max(s.unlockedCount, Math.min(s.boardIndex + 2, CAMPAIGN_LENGTH)),
    selectIndex: s.boardIndex,
  };
}
const replaceBeam = (
  s: State,
  channel: Channel,
  cells: readonly Cell[],
): RefractState => ({
  ...s,
  beams: s.beams.map((b) => (b.channel === channel ? { channel, cells } : b)),
});
function grab(s: State, node: NodeState): RefractState {
  const empty = s.beams.find(
    (b) => b.channel === node.channel && b.cells.length < 2,
  );
  if (node.kind === "emitter" && empty)
    return {
      ...replaceBeam(s, empty.channel, [{ col: node.col, row: node.row }]),
      tracing: { channel: empty.channel },
    };
  const end = s.beams.find(
    (b) => same(b.cells[0], node) || same(b.cells[b.cells.length - 1], node),
  );
  if (end)
    return {
      ...replaceBeam(
        s,
        end.channel,
        same(end.cells[0], node) ? [...end.cells].reverse() : end.cells,
      ),
      tracing: { channel: end.channel },
    };
  const through = s.beams.filter((b) => b.cells.some((c) => same(c, node)));
  if (through.length !== 1) return s;
  const beam = through[0];
  let index = beam.cells.length - 1;
  while (!same(beam.cells[index], node)) index--;
  return {
    ...replaceBeam(s, beam.channel, beam.cells.slice(0, index + 1)),
    tracing: { channel: beam.channel },
  };
}
export function pointer(
  s: State,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice = "mouse",
): RefractState {
  let next: RefractState = {
    ...s,
    pointer: {
      x,
      y,
      device,
      down: type === "down" ? true : type === "up" ? false : s.pointer.down,
    },
  };
  const target = targets(next).find(
    (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
  );
  if (target && (type === "down" || (type === "move" && !s.pointer.down))) {
    if (target.id.startsWith("menu-"))
      next = { ...next, menuIndex: Number(target.id.slice(5)) };
    if (target.id.startsWith("board-"))
      next = { ...next, selectIndex: Number(target.id.slice(6)) - 1 };
  }
  if (type === "up") {
    next = {
      ...next,
      tracing: null,
      armedTarget: null,
      beams: next.beams.map((b) =>
        b.cells.length === 1 ? { ...b, cells: [] } : b,
      ),
    };
    if (target && target.id === s.armedTarget)
      return action(
        next,
        target.id === "clear" || target.id === "back" ? target.id : "confirm",
      );
    return next;
  }
  if (type === "down")
    next = { ...next, armedTarget: target?.id ?? null, tracing: null };
  if (next.screen !== "playing" || target || next.armedTarget) return next;
  const node = next.board.nodes.find(
    (n) =>
      Math.hypot(
        cellX(n.col, next.board.cols) - x,
        cellY(n.row, next.board.rows) - y,
      ) <= NODE_HIT_R,
  );
  if (!node) return next;
  if (type === "down") return finish(grab(next, node));
  if (!next.pointer.down || !next.tracing) return next;
  const beam = next.beams.find((b) => b.channel === next.tracing?.channel);
  if (!beam) return next;
  if (same(beam.cells[beam.cells.length - 2], node))
    return finish(replaceBeam(next, beam.channel, beam.cells.slice(0, -1)));
  if (canExtend(next.board, next.beams, beam.channel, node))
    return finish(
      replaceBeam(next, beam.channel, [
        ...beam.cells,
        { col: node.col, row: node.row },
      ]),
    );
  return next;
}
const debug: RefractDebugApi = {
  version: REFRACT_DEBUG_VERSION,
  reset: (s) => initial(s.muted),
  snapshot,
  reconcile: (s) => ({ ...s }),
  setMode: (s, mode) => ({ ...s, mode }),
  setScreen: (s, screen) => ({ ...s, screen, armedTarget: null }),
  setMenuIndex: (s, menuIndex) => ({ ...s, menuIndex }),
  setSolvedCount: (s, solvedCount) => ({ ...s, solvedCount }),
  setTier: (s, tier) => ({ ...s, tier }),
  generateBoard: (s, tier) => poseBoard(s, generate(tier)),
  loadBoard: (s, board) => poseBoard(s, parseBoard(board)),
  pointerDown: (s, x, y, device) => pointer(s, "down", x, y, device),
  pointerMove: (s, x, y, device) => pointer(s, "move", x, y, device),
  pointerUp: (s, device) => pointer(s, "up", s.pointer.x, s.pointer.y, device),
  clear,
};
export const game: Game<RefractState, RefractDebugApi> = {
  initialize(api) {
    ACTIONS.forEach((name) =>
      api.input.register(name, { keys: [...BINDINGS[name]] }),
    );
    Object.values(CUES).forEach((cue, i) =>
      api.audio.define(cue, {
        wave: i === 1 ? "triangle" : "sine",
        freq: [440, 330, 660, 880, 220][i],
        freqTo: [660, 180, 990, 1320, 90][i],
        durationMs: [70, 90, 180, 360, 150][i],
        gain: 0.11,
      }),
    );
    api.diagnostics.register("screen", (s) => `${s.mode} / ${s.screen}`);
    api.diagnostics.register(
      "board",
      (s) => `${s.board.cols} × ${s.board.rows}`,
    );
    CHANNELS.forEach((channel) =>
      api.diagnostics.register(channel, (s) => {
        const beam = s.beams.find((b) => b.channel === channel);
        return beam
          ? `${Math.max(0, beam.cells.length - 1)} segments / ${complete(s.board, beam) ? "complete" : "open"}`
          : "absent";
      }),
    );
    for (let row = 0; row < GRID_MAX_ROWS; row++)
      api.diagnostics.register(
        `crystals row ${row}`,
        (s) =>
          s.board.nodes
            .filter((n) => n.kind === "crystal" && n.row === row)
            .map((n) => `c${n.col}: ${spent(s.beams, n)}/${n.charges}`)
            .join(" | ") || "none",
      );
    api.diagnostics.register("solved", (s) => solved(s));
    api.diagnostics.register(
      "pointer",
      (s) =>
        `${s.pointer.x.toFixed(0)},${s.pointer.y.toFixed(0)} ${s.pointer.device}`,
    );
    return [initial(), debug];
  },
  update(state, api, dt) {
    let s: RefractState = state;
    const cues = new Set<string>();
    const observe = (next: RefractState, clearing = false) => {
      const length = (v: State) =>
        v.beams.reduce((n, b) => n + Math.max(0, b.cells.length - 1), 0);
      if (
        s.board === next.board &&
        (next.screen === "playing" ||
          next.screen === "solved" ||
          next.screen === "complete")
      ) {
        if (length(next) > length(s)) cues.add(CUES.connect);
        if (length(next) < length(s))
          cues.add(clearing ? CUES.clear : CUES.retract);
        if (
          next.beams.some(
            (b) =>
              complete(next.board, b) &&
              !s.beams.some(
                (old) => old.channel === b.channel && complete(s.board, old),
              ),
          )
        )
          cues.add(CUES.channelComplete);
        if (
          s.screen === "playing" &&
          (next.screen === "solved" || next.screen === "complete")
        )
          cues.add(CUES.solved);
      }
      s = next;
    };
    for (const key of ACTIONS)
      if (api.input.pressed(key)) {
        if (key === "mute") api.audio.setMuted(!api.audio.muted());
        else observe(action(s, key), key === "clear");
      }
    for (const sample of api.input.pointerSamples())
      if (sample.primary)
        observe(
          pointer(s, sample.type, sample.x, sample.y, sample.device),
          sample.type === "up" && s.armedTarget === "clear",
        );
    observe(finish(s));
    cues.forEach((cue) => api.audio.play(cue));
    const p = api.input.pointer();
    return {
      ...s,
      pointer: { x: p.x, y: p.y, down: p.down, device: p.device },
      simTime: s.simTime + dt,
      muted: api.audio.muted(),
    };
  },
  render(s, api) {
    draw(s, api.ctx);
  },
};
