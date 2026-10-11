import { afterEach, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import { game, BACKGROUND, initial, action, targets, type Cell } from "./game";
import { CAMPAIGN } from "./campaign";
import {
  canExtend,
  cellX,
  cellY,
  emptyBeams,
  parseBoard,
  solved,
} from "./rules";
import { analyze } from "./solver";
import {
  TIERS,
  CAMPAIGN_LENGTH,
  STAGE_W,
  STAGE_H,
  CUES,
  CHANNELS,
} from "./constants";
import pools from "./cascade-pool.json";
import { generate } from "./generator";

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((fn) => fn()));
async function harness(step = 1000 / 60) {
  const events = new EventTarget();
  const canvas = createCanvas(STAGE_W, STAGE_H);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: STAGE_W,
    height: STAGE_H,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(step),
    surface: {
      cssWidth: () => STAGE_W,
      cssHeight: () => STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  await engine.initialize();
  cleanup.push(() => engine.destroy());
  const debug = engine.debug;
  const load = (lines: readonly string[]) =>
    engine.apply((s) => debug.loadBoard(s, lines));
  const point = (type: "down" | "move", col: number, row: number) =>
    engine.apply((s) =>
      debug[type === "down" ? "pointerDown" : "pointerMove"](
        s,
        cellX(col, s.board.cols),
        cellY(row, s.board.rows),
      ),
    );
  const up = () => engine.apply((s) => debug.pointerUp(s));
  const route = (cells: readonly Cell[]) => {
    cells.forEach((c, i) => point(i ? "move" : "down", c.col, c.row));
    up();
  };
  const key = async (code: string) => {
    events.dispatchEvent(Object.assign(new Event("keydown"), { code }));
    await engine.advance(1);
    events.dispatchEvent(Object.assign(new Event("keyup"), { code }));
  };
  const sample = (
    type: string,
    col: number,
    row: number,
    device = "mouse",
    primary = true,
  ) => {
    events.dispatchEvent(
      Object.assign(new Event("pointer" + type), {
        clientX: cellX(col, engine.state.board.cols),
        clientY: cellY(row, engine.state.board.rows),
        pointerType: device,
        isPrimary: primary,
        pointerId: primary ? 1 : 2,
        button: 0,
        buttons: type === "up" ? 0 : 1,
      }),
    );
  };
  return { engine, debug, load, point, up, route, key, sample };
}
describe("engine and immutable debug surface", () => {
  it("initializes all fields, registers diagnostics, and advances time on menus", async () => {
    const { engine, debug } = await harness(20);
    const before = engine.state;
    expect(debug.snapshot(before)).toMatchObject({
      version: 2,
      screen: "title",
      mode: "campaign",
      solvedBoards: [],
      unlockedCount: 1,
      solvedCount: 0,
      tier: 1,
      tracing: null,
    });
    await engine.advance(10);
    expect(engine.state.simTime).toBeCloseTo(0.2);
    expect(before.simTime).toBe(0);
    expect(engine.diagnostics().length).toBeGreaterThanOrEqual(6);
  });
  it("poses exactly one named field and reconciles without simulation", async () => {
    const { engine, debug, load, point } = await harness();
    load(["TtT"]);
    point("down", 0, 0);
    let s = engine.state;
    s = debug.setSolvedCount(s, 17);
    expect(s.tier).toBe(1);
    s = debug.setTier(s, 5);
    expect(s.solvedCount).toBe(17);
    const before = s;
    s = debug.setMode(s, "cascade");
    expect(s).toEqual({ ...before, mode: "cascade" });
    s = debug.setMenuIndex(s, 9);
    expect(s.menuIndex).toBe(9);
    s = debug.setScreen(s, "complete");
    expect(s.tracing).not.toBeNull();
    expect(debug.reconcile(s)).toEqual(s);
    expect(debug.snapshot(s).board.nodes[0]).toMatchObject({ x: 544, y: 392 });
    expect(debug.reset({ ...s, muted: true })).toEqual(initial(true));
    expect(debug.clear(s).beams[0].cells).toEqual([]);
  });
  it.each(
    [
      [],
      [""],
      ["T?T"],
      ["TT", "T"],
      ["TT......"],
      ["T", "t", "t", "t", "t", "t", "T"],
    ].map((lines) => ({ lines })),
  )("rejects malformed notation %j", async ({ lines }) => {
    const { load } = await harness();
    expect(() => load(lines)).toThrow();
  });
  it("debug generation preserves unrelated progression and supports all tiers", async () => {
    const { engine, debug } = await harness();
    for (let tier = 1; tier <= TIERS.length; tier++) {
      engine.apply((s) =>
        debug.generateBoard({ ...s, menuIndex: 7, solvedCount: 18 }, tier),
      );
      expect(engine.state).toMatchObject({
        screen: "playing",
        tier: 1,
        mode: "campaign",
        menuIndex: 7,
        solvedCount: 18,
      });
      expect(engine.state.beams.every((b) => !b.cells.length)).toBe(true);
    }
    expect(() => generate(0)).toThrow();
  });
});
describe("drawing and R1–R9", () => {
  it("retains partial beams, resumes either end, and removes a lone cell on release", async () => {
    const { engine, load, point, up } = await harness();
    load(["TttT"]);
    point("down", 0, 0);
    up();
    expect(engine.state.beams[0].cells).toEqual([]);
    point("down", 0, 0);
    point("move", 1, 0);
    up();
    point("down", 0, 0);
    expect(engine.state.beams[0].cells).toEqual([
      { col: 1, row: 0 },
      { col: 0, row: 0 },
    ]);
    point("move", 1, 0);
    expect(engine.state.beams[0].cells.length).toBe(1);
    up();
    expect(engine.state.beams[0].cells).toEqual([]);
  });
  it("shortens at the last occurrence and refuses off-board and unused lenses", async () => {
    const { engine, load, point, debug } = await harness();
    load(["TtttT"]);
    point("down", 1, 0);
    expect(engine.state.tracing).toBeNull();
    point("down", 0, 0);
    point("move", 1, 0);
    point("move", 2, 0);
    point("move", 3, 0);
    engine.apply((s) => debug.pointerUp(s));
    point("down", 1, 0);
    expect(engine.state.beams[0].cells.length).toBe(2);
    engine.apply((s) => debug.pointerDown(s, 0, 0));
    expect(engine.state.tracing).toBeNull();
    expect(engine.state.pointer.down).toBe(true);
  });
  it("allows an early emitter arrival without declaring coverage complete", async () => {
    const { engine, debug, load, point } = await harness();
    load(["TT", "tt"]);
    point("down", 0, 0);
    point("move", 1, 0);
    expect(debug.snapshot(engine.state).beams.triangle.complete).toBe(false);
    expect(engine.state.screen).toBe("playing");
    point("move", 1, 1);
    expect(engine.state.beams[0].cells.length).toBe(2);
  });
  it("checks adjacency, exclusion, duplicate edges and both diagonal directions", () => {
    const board = parseBoard(["TSS", "ttT"]);
    const beams = [
      { channel: "triangle" as const, cells: [{ col: 0, row: 0 }] },
    ];
    expect(canExtend(board, beams, "triangle", { col: 2, row: 1 })).toBe(false);
    expect(canExtend(board, beams, "triangle", { col: 1, row: 0 })).toBe(false);
    expect(canExtend(board, beams, "triangle", { col: 0, row: 0 })).toBe(false);
    const b = parseBoard(["Tt", "tT"]);
    const a = { col: 0, row: 0 },
      z = { col: 1, row: 1 },
      c = { col: 0, row: 1 },
      d = { col: 1, row: 0 };
    const route = [{ channel: "triangle" as const, cells: [a, z, c] }];
    expect(canExtend(b, route, "triangle", d)).toBe(false);
    expect(canExtend(b, route, "triangle", z)).toBe(false);
  });
  it("spends crystal charges on entry, refunds retraction, and permits neutral sharing", async () => {
    const { engine, debug, load, point, up } = await harness();
    load(["T.S", "t2s", "T.S"]);
    point("down", 0, 0);
    point("move", 1, 1);
    expect(
      debug.snapshot(engine.state).board.nodes.find((n) => n.kind === "crystal")
        ?.spent,
    ).toBe(1);
    point("move", 0, 0);
    expect(
      debug.snapshot(engine.state).board.nodes.find((n) => n.kind === "crystal")
        ?.spent,
    ).toBe(0);
    point("move", 0, 1);
    point("move", 1, 1);
    point("move", 0, 2);
    up();
    point("down", 2, 0);
    point("move", 2, 1);
    point("move", 1, 1);
    point("move", 2, 2);
    expect(engine.state.screen).toBe("solved");
    expect(debug.snapshot(engine.state).solved).toBe(true);
    up();
    expect(engine.state.tracing).toBeNull();
  });
  it("refuses full crystals without ending the trace", async () => {
    const { engine, load, point, up } = await harness();
    load(["T.S", "t1s", "T.S"]);
    point("down", 0, 0);
    point("move", 0, 1);
    point("move", 1, 1);
    point("move", 0, 2);
    up();
    point("down", 2, 0);
    point("move", 2, 1);
    point("move", 1, 1);
    expect(engine.state.beams[1].cells.length).toBe(2);
    expect(engine.state.tracing?.channel).toBe("square");
  });
  it("uses beam ends before ambiguous shared interiors", async () => {
    const { engine, load, debug, point } = await harness();
    load(["T.S", "t2s", "T.S"]);
    engine.apply((s) => ({
      ...s,
      beams: [
        {
          channel: "triangle",
          cells: [
            { col: 0, row: 0 },
            { col: 1, row: 1 },
            { col: 0, row: 2 },
          ],
        },
        {
          channel: "square",
          cells: [
            { col: 2, row: 0 },
            { col: 1, row: 1 },
            { col: 2, row: 2 },
          ],
        },
      ],
    }));
    point("down", 1, 1);
    expect(engine.state.tracing).toBeNull();
    engine.apply((s) => ({
      ...s,
      beams: s.beams.map((b) =>
        b.channel === "square" ? { ...b, cells: b.cells.slice(0, 2) } : b,
      ),
    }));
    point("down", 1, 1);
    expect(engine.state.tracing?.channel).toBe("square");
    expect(debug.snapshot(engine.state).tracing?.live).toEqual({
      col: 1,
      row: 1,
    });
  });
  it("keeps the last occurrence of a repeated crystal when shortening", async () => {
    const { engine, load, point } = await harness();
    load(["Ttt", "t2t", "ttT"]);
    const c = { col: 1, row: 1 };
    engine.apply((s) => ({
      ...s,
      beams: [
        {
          channel: "triangle",
          cells: [
            { col: 0, row: 0 },
            c,
            { col: 1, row: 0 },
            { col: 2, row: 0 },
            c,
            { col: 0, row: 1 },
          ],
        },
      ],
    }));
    point("down", 1, 1);
    expect(engine.state.beams[0].cells.length).toBe(5);
  });
  it.each(["mouse", "pen", "touch"] as const)(
    "uses ordered %s input samples and emits every cue once per frame",
    async (device) => {
      const { engine, load, sample, key } = await harness();
      load(["TttT"]);
      const cues: string[] = [];
      engine.events.on("cue:played", (e) => cues.push(e.cue));
      sample("down", 0, 0, device);
      sample("move", 1, 0, device);
      sample("move", 2, 0, device);
      sample("move", 1, 0, device);
      await engine.advance(1);
      expect(engine.state.beams[0].cells.length).toBe(2);
      expect(cues).toEqual([CUES.connect, CUES.retract]);
      expect(engine.state.pointer.device).toBe(device);
      await key("KeyR");
      expect(cues.filter((c) => c === CUES.clear)).toHaveLength(1);
      sample("up", 1, 0, device);
      await engine.advance(1);
      sample("down", 0, 0, device);
      sample("move", 1, 0, device);
      sample("move", 2, 0, device);
      sample("move", 3, 0, device);
      await engine.advance(1);
      expect(engine.state.screen).toBe("solved");
      expect(cues.slice(-3)).toEqual([
        CUES.connect,
        CUES.channelComplete,
        CUES.solved,
      ]);
    },
  );
});
describe("screen navigation and progression", () => {
  it("navigates all menus with keys, wraps grid rows/columns, and ignores locked boards", async () => {
    const { engine, key } = await harness();
    await key("ArrowUp");
    expect(engine.state.menuIndex).toBe(2);
    await key("Enter");
    expect(engine.state.screen).toBe("howto");
    await key("Escape");
    expect(engine.state.menuIndex).toBe(2);
    await key("ArrowDown");
    await key("Enter");
    expect(engine.state.screen).toBe("select");
    await key("ArrowLeft");
    expect(engine.state.selectIndex).toBe(5);
    await key("ArrowUp");
    expect(engine.state.selectIndex).toBe(23);
    await key("Enter");
    expect(engine.state.screen).toBe("select");
    await key("ArrowRight");
    await key("ArrowDown");
    expect(engine.state.selectIndex).toBe(0);
    await key("Enter");
    expect(engine.state.screen).toBe("playing");
    await key("Enter");
    expect(engine.state.screen).toBe("playing");
    await key("Escape");
    expect(engine.state.screen).toBe("select");
    await key("Escape");
    expect(engine.state.menuIndex).toBe(0);
  });
  it("takes targets only after a matching release, including touch and clear", async () => {
    const { engine, debug } = await harness();
    const click = (id: string) => {
      const t = debug.snapshot(engine.state).targets.find((t) => t.id === id)!;
      engine.apply((s) =>
        debug.pointerDown(s, t.x + t.w / 2, t.y + t.h / 2, "touch"),
      );
      engine.apply((s) => debug.pointerUp(s, "touch"));
    };
    const t = targets(engine.state)[1];
    engine.apply((s) => debug.pointerMove(s, t.x + 1, t.y + 1));
    expect(engine.state.menuIndex).toBe(1);
    engine.apply((s) => debug.pointerDown(s, t.x + 1, t.y + 1));
    engine.apply((s) => debug.pointerMove(s, 0, 0));
    engine.apply((s) => debug.pointerUp(s));
    expect(engine.state.screen).toBe("title");
    click("menu-0");
    click("board-2");
    expect(engine.state.screen).toBe("select");
    click("board-1");
    click("clear");
    click("back");
    click("back");
    expect(engine.state.screen).toBe("title");
  });
  it("solves campaign boards, unlocks once, replays empty, and reaches completion", async () => {
    const { engine, load, route, key } = await harness();
    load(["TtT"]);
    route([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
    ]);
    expect(engine.state).toMatchObject({
      screen: "solved",
      solvedBoards: [0],
      unlockedCount: 2,
      selectIndex: 0,
    });
    await key("ArrowDown");
    await key("Enter");
    expect(engine.state.beams[0].cells).toEqual([]);
    expect(engine.state.board).toEqual(parseBoard(CAMPAIGN[0]));
    const solution = analyze(engine.state.board)!;
    solution.solution.forEach((b) => route(b.cells));
    expect(engine.state.solvedBoards).toEqual([0]);
    await key("Enter");
    expect(engine.state.boardIndex).toBe(1);
    engine.apply((s) => ({
      ...s,
      boardIndex: 23,
      solvedBoards: Array.from({ length: 23 }, (_, i) => i),
      unlockedCount: 24,
    }));
    load(["TT"]);
    route([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(engine.state.screen).toBe("complete");
    expect(engine.state.solvedBoards.length).toBe(24);
    await key("ArrowDown");
    await key("Enter");
    expect(engine.state.screen).toBe("title");
  });
  it("offers only replay and select on final-board solves before the course is complete", async () => {
    const { engine, load, route, key } = await harness();
    engine.apply((s) => ({ ...s, boardIndex: 23 }));
    load(["TT"]);
    route([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(targets(engine.state)).toHaveLength(2);
    await key("ArrowDown");
    await key("Enter");
    expect(engine.state.screen).toBe("select");
  });
  it("keeps progress independent, advances tiers, restarts Cascade, and binds mute everywhere", async () => {
    const { engine, load, route, key } = await harness();
    engine.apply((s) => ({
      ...s,
      solvedBoards: [0],
      unlockedCount: 2,
      boardIndex: 1,
      selectIndex: 1,
    }));
    await key("ArrowDown");
    await key("Enter");
    expect(engine.state.mode).toBe("cascade");
    engine.apply((s) => ({ ...s, solvedCount: 4 }));
    load(["TT"]);
    route([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(engine.state).toMatchObject({
      screen: "solved",
      tier: 2,
      solvedCount: 5,
      solvedBoards: [0],
      unlockedCount: 2,
    });
    await key("Enter");
    expect(engine.state.beams.length).toBe(2);
    load(["TT"]);
    route([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    await key("ArrowDown");
    await key("Enter");
    expect(engine.state).toMatchObject({ tier: 1, solvedCount: 0 });
    await key("KeyM");
    expect(engine.state.muted).toBe(true);
    await key("Escape");
    expect(engine.state.menuIndex).toBe(1);
    await key("ArrowUp");
    await key("Enter");
    expect(engine.state).toMatchObject({
      screen: "select",
      solvedBoards: [0],
      unlockedCount: 2,
    });
  });
  it("has disjoint, accessible targets wholly on stage on every screen", () => {
    for (const screen of [
      "title",
      "howto",
      "select",
      "playing",
      "solved",
      "complete",
    ] as const)
      for (const mode of ["campaign", "cascade"] as const) {
        const ts = targets({ ...initial(), screen, mode });
        ts.forEach((t, i) => {
          expect(t.w).toBeGreaterThanOrEqual(96);
          expect(t.h).toBeGreaterThanOrEqual(72);
          expect(t.x).toBeGreaterThanOrEqual(0);
          expect(t.y).toBeGreaterThanOrEqual(0);
          expect(t.x + t.w).toBeLessThanOrEqual(STAGE_W);
          expect(t.y + t.h).toBeLessThanOrEqual(STAGE_H);
          ts.slice(i + 1).forEach((b) =>
            expect(
              t.x + t.w <= b.x ||
                b.x + b.w <= t.x ||
                t.y + t.h <= b.y ||
                b.y + b.h <= t.y,
            ).toBe(true),
          );
        });
      }
  });
  it("renders every screen and preserves state during recording", async () => {
    const { engine, debug, load } = await harness();
    load(CAMPAIGN[18]);
    engine.startRecording();
    for (const screen of [
      "title",
      "howto",
      "select",
      "playing",
      "solved",
      "complete",
    ] as const) {
      engine.apply((s) => debug.setScreen(s, screen));
      await engine.advance(1);
    }
    const recording = engine.stopRecording();
    expect(recording.frames).toHaveLength(6);
    expect(recording.ops.length).toBeGreaterThan(100);
  });
  it("leaves clear inert outside play and back inert on title", () => {
    const s = initial();
    expect(action(s, "back")).toEqual(s);
    expect(action(s, "clear")).toEqual(s);
    expect(action(s, "left")).toEqual(s);
  });
});
describe("boards and difficulty certification", () => {
  it("ships all fixed campaign boards in reading order", () => {
    expect(CAMPAIGN).toHaveLength(CAMPAIGN_LENGTH);
    CAMPAIGN.forEach((lines) => {
      const b = parseBoard(lines);
      expect(
        b.nodes.every(
          (n, i) =>
            i === 0 ||
            n.row * b.cols + n.col >
              b.nodes[i - 1].row * b.cols + b.nodes[i - 1].col,
        ),
      ).toBe(true);
      expect(
        emptyBeams(b).every(
          (beam) =>
            b.nodes.filter(
              (n) => n.channel === beam.channel && n.kind === "emitter",
            ).length === 2,
        ),
      ).toBe(true);
    });
  });
  it("rejects unsolvable and over-budget searches", () => {
    expect(analyze(parseBoard(["T.T"]))).toBeNull();
    expect(analyze(parseBoard(["TttT"]), 0)).toBeNull();
    expect(solved({ board: parseBoard(["TT"]), beams: [] })).toBe(false);
  });
  it.each(pools.map((p) => [p.tier, p.cols, p.rows, p] as const))(
    "certifies every tier %i %ix%i arrangement",
    (_tier, _cols, _rows, pool) => {
      const t = TIERS[pool.tier - 1];
      for (const lines of pool.boards) {
        const b = parseBoard(lines),
          a = analyze(b);
        expect(a, lines.join("/")).not.toBeNull();
        if (!a) continue;
        expect(a.routes.every((n) => n >= t.minRoutes)).toBe(true);
        expect(a.solutions).toBeGreaterThanOrEqual(t.minSolutions);
        expect(a.solutions).toBeLessThanOrEqual(t.maxSolutions);
        expect(a.determinedShare).toBeLessThanOrEqual(t.maxDeterminedShare);
        expect(a.branching).toBeGreaterThanOrEqual(t.minBranching);
        expect(a.sharedCrystals).toBeGreaterThanOrEqual(t.minSharedCrystals);
        expect(emptyBeams(b).map((v) => v.channel)).toEqual(
          CHANNELS.slice(0, t.channels),
        );
        expect(b.cols * b.rows - b.nodes.length).toBeLessThanOrEqual(
          t.maxEmptyCells,
        );
        const crystals = b.nodes.filter((n) => n.kind === "crystal");
        expect(crystals.length).toBeGreaterThanOrEqual(t.minCrystals);
        expect(crystals.length).toBeLessThanOrEqual(t.maxCrystals);
        crystals.forEach((n) => {
          expect(n.charges).toBeGreaterThanOrEqual(t.minCharges);
          expect(n.charges).toBeLessThanOrEqual(t.maxCharges);
        });
        expect(solved({ board: b, beams: a.solution })).toBe(true);
      }
    },
    60000,
  );
  it("solves representative multichannel campaign boards through the actual grab and move path", async () => {
    const { engine, load, route } = await harness();
    for (const index of [0, 6, 10, 13, 18, 23]) {
      load(CAMPAIGN[index]);
      const a = analyze(engine.state.board)!;
      expect(a).not.toBeNull();
      a.solution.forEach((b) => route(b.cells));
      expect(engine.state.screen).toBe("solved");
    }
  });
});
