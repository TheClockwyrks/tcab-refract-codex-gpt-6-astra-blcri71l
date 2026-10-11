import type {
  BeamState,
  BoardState,
  Cell,
  Channel,
  RefractState,
} from "./game";
import {
  BOARD_CX,
  BOARD_CY,
  CELL_PITCH,
  CHANNELS,
  GRID_MAX_COLS,
  GRID_MAX_ROWS,
} from "./constants";

export const same = (a: Cell | undefined, b: Cell | undefined): boolean =>
  !!a && !!b && a.col === b.col && a.row === b.row;
export const cellX = (col: number, cols: number): number =>
  BOARD_CX - ((cols - 1) * CELL_PITCH) / 2 + col * CELL_PITCH;
export const cellY = (row: number, rows: number): number =>
  BOARD_CY - ((rows - 1) * CELL_PITCH) / 2 + row * CELL_PITCH;
export const nodeAt = (board: BoardState, cell: Cell) =>
  board.nodes.find((n) => same(n, cell));
export function parseBoard(lines: readonly string[]): BoardState {
  const cols = lines[0]?.length ?? 0;
  if (
    !cols ||
    cols > GRID_MAX_COLS ||
    !lines.length ||
    lines.length > GRID_MAX_ROWS ||
    lines.some((r) => r.length !== cols || /[^.TSDtsd123]/.test(r))
  )
    throw new Error("Invalid board notation or dimensions");
  const nodes: BoardState["nodes"][number][] = [];
  lines.forEach((line, row) =>
    [...line].forEach((ch, col) => {
      if (ch === ".") return;
      const channel =
        ({ t: "triangle", s: "square", d: "diamond" } as const)[
          ch.toLowerCase() as "t" | "s" | "d"
        ] ?? null;
      nodes.push({
        col,
        row,
        channel,
        kind: channel
          ? ch === ch.toUpperCase()
            ? "emitter"
            : "lens"
          : "crystal",
        charges: channel ? null : Number(ch),
      });
    }),
  );
  return { cols, rows: lines.length, nodes };
}
export const emptyBeams = (board: BoardState): BeamState[] =>
  CHANNELS.filter((ch) => board.nodes.some((n) => n.channel === ch)).map(
    (channel) => ({ channel, cells: [] }),
  );
export const spent = (beams: readonly BeamState[], cell: Cell): number =>
  beams.reduce((n, b) => n + b.cells.filter((c) => same(c, cell)).length, 0);
export function complete(board: BoardState, beam: BeamState): boolean {
  const { cells, channel } = beam;
  if (cells.length < 2 || same(cells[0], cells[cells.length - 1])) return false;
  if (
    nodeAt(board, cells[0])?.kind !== "emitter" ||
    nodeAt(board, cells[cells.length - 1])?.kind !== "emitter"
  )
    return false;
  return board.nodes
    .filter((n) => n.channel === channel && n.kind === "lens")
    .every((n) => cells.slice(1, -1).some((c) => same(n, c)));
}
export function solved(s: Pick<RefractState, "board" | "beams">): boolean {
  return (
    s.beams.length > 0 &&
    s.beams.every((b) => complete(s.board, b)) &&
    s.board.nodes
      .filter((n) => n.kind === "crystal")
      .every(
        (n) =>
          spent(s.beams, n) === n.charges &&
          s.beams.every(
            (b) =>
              !same(b.cells[0], n) && !same(b.cells[b.cells.length - 1], n),
          ),
      )
  );
}
export function conflicts(a: Cell, b: Cell, c: Cell, d: Cell): boolean {
  if ((same(a, c) && same(b, d)) || (same(a, d) && same(b, c))) return true;
  return (
    a.col !== b.col &&
    a.row !== b.row &&
    c.col !== d.col &&
    c.row !== d.row &&
    a.col + b.col === c.col + d.col &&
    a.row + b.row === c.row + d.row
  );
}
/** Only R1–R5 belong here. An early arrival at the far emitter is legal. */
export function canExtend(
  board: BoardState,
  beams: readonly BeamState[],
  channel: Channel,
  to: Cell,
): boolean {
  const beam = beams.find((b) => b.channel === channel);
  const cells = beam?.cells ?? [];
  const from = cells[cells.length - 1];
  const node = nodeAt(board, to);
  if (
    !from ||
    !node ||
    same(from, to) ||
    Math.abs(from.col - to.col) > 1 ||
    Math.abs(from.row - to.row) > 1
  )
    return false;
  if (node.channel && node.channel !== channel) return false;
  const degree = (cell: Cell) =>
    beams.reduce(
      (sum, b) =>
        sum +
        b.cells
          .slice(1)
          .reduce(
            (n, c, i) =>
              n + Number(same(c, cell)) + Number(same(b.cells[i], cell)),
            0,
          ),
      0,
    );
  const origin = nodeAt(board, from);
  if (
    origin?.kind !== "crystal" &&
    degree(from) >= (origin?.kind === "emitter" ? 1 : 2)
  )
    return false;
  if (
    node.kind === "crystal"
      ? spent(beams, to) >= (node.charges ?? 0)
      : degree(to) >= (node.kind === "emitter" ? 1 : 2)
  )
    return false;
  return beams.every((b) =>
    b.cells.slice(1).every((c, i) => !conflicts(from, to, b.cells[i], c)),
  );
}
