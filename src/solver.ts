import type { BoardState, Cell, Channel, BeamState } from "./game";
import { CHANNELS } from "./constants";
import { canExtend, conflicts } from "./rules";

export interface Analysis {
  readonly routes: readonly number[];
  readonly solutions: number;
  readonly determinedShare: number;
  readonly branching: number;
  readonly sharedCrystals: number;
  readonly solution: readonly BeamState[];
}
interface Route {
  cells: Cell[];
  edges: bigint;
  blocks: bigint;
  visits: number[];
}
/** Exhaustive, direction-independent enumeration. A bounded search rejects rather than certifies on overflow. */
export function analyze(board: BoardState, budget = 500000): Analysis | null {
  const nodes = board.nodes;
  const channels = CHANNELS.filter((ch) => nodes.some((n) => n.channel === ch));
  const crystals = nodes.filter((n) => n.kind === "crystal");
  const edges: [number, number][] = [];
  const edgeIndex = nodes.map(() => nodes.map(() => -1));
  nodes.forEach((a, i) =>
    nodes.forEach((b, j) => {
      if (
        i < j &&
        Math.abs(a.col - b.col) <= 1 &&
        Math.abs(a.row - b.row) <= 1
      ) {
        edgeIndex[i][j] = edgeIndex[j][i] = edges.length;
        edges.push([i, j]);
      }
    }),
  );
  const bits = edges.map((_, i) => 1n << BigInt(i));
  const blocks = edges.map(([a, b]) =>
    edges.reduce(
      (mask, [c, d], i) =>
        conflicts(nodes[a], nodes[b], nodes[c], nodes[d])
          ? mask | bits[i]
          : mask,
      0n,
    ),
  );
  let steps = 0;
  let overflow = false;
  const routes = channels.map((channel) => {
    const emitters = nodes
      .map((n, i) => (n.kind === "emitter" && n.channel === channel ? i : -1))
      .filter((i) => i >= 0);
    if (emitters.length !== 2) return [];
    const lensCount = nodes.filter(
      (n) => n.kind === "lens" && n.channel === channel,
    ).length;
    const visits = nodes.map(() => 0);
    const path = [emitters[0]];
    visits[emitters[0]] = 1;
    const found: Route[] = [];
    const keys = new Set<bigint>();
    const adjacent = nodes.map((_, i) =>
      nodes
        .map((n, j) =>
          edgeIndex[i][j] >= 0 && (!n.channel || n.channel === channel)
            ? j
            : -1,
        )
        .filter((j) => j >= 0),
    );
    function walk(at: number, mask: bigint, blocked: bigint, lenses: number) {
      if (++steps > budget || found.length > 4096) {
        overflow = true;
        return;
      }
      if (at === emitters[1]) {
        if (lenses === lensCount && !keys.has(mask)) {
          keys.add(mask);
          found.push({
            cells: path.map((i) => ({ col: nodes[i].col, row: nodes[i].row })),
            edges: mask,
            blocks: blocked,
            visits: crystals.map((n) => visits[nodes.indexOf(n)]),
          });
        }
        return;
      }
      for (const next of adjacent[at]) {
        const n = nodes[next];
        const edge = edgeIndex[at][next];
        if ((blocked & bits[edge]) !== 0n || visits[next] >= (n.charges ?? 1))
          continue;
        visits[next]++;
        path.push(next);
        walk(
          next,
          mask | bits[edge],
          blocked | blocks[edge],
          lenses + (n.kind === "lens" ? 1 : 0),
        );
        path.pop();
        visits[next]--;
        if (overflow) return;
      }
    }
    walk(emitters[0], 0n, 0n, 0);
    return found;
  });
  if (overflow || routes.some((r) => !r.length)) return null;
  let solutions = 0,
    sharedCrystals = 0,
    branches = 0,
    segments = 0;
  let intersection: bigint[] = [];
  let solution: BeamState[] = [];
  const picked: Route[] = [];
  function combine(index: number, blocked: bigint, charges: number[]) {
    if (++steps > budget) {
      overflow = true;
      return;
    }
    if (index === channels.length) {
      if (charges.some((v, i) => v !== crystals[i].charges)) return;
      solutions++;
      if (solutions > 256) {
        overflow = true;
        return;
      }
      const beams = picked.map((r, i) => ({
        channel: channels[i],
        cells: r.cells,
      }));
      if (solutions === 1) {
        intersection = picked.map((r) => r.edges);
        solution = beams;
      } else intersection = intersection.map((v, i) => v & picked[i].edges);
      sharedCrystals = Math.max(
        sharedCrystals,
        crystals.filter(
          (_, i) => picked.filter((r) => r.visits[i] > 0).length > 1,
        ).length,
      );
      const partial: BeamState[] = [];
      beams.forEach((beam) => {
        let cells: readonly Cell[] = [beam.cells[0]];
        partial.push({ channel: beam.channel, cells });
        for (const next of beam.cells.slice(1)) {
          branches += nodes.filter((n) =>
            canExtend(board, partial, beam.channel, n),
          ).length;
          segments++;
          cells = [...cells, next];
          partial[partial.length - 1] = { channel: beam.channel, cells };
        }
      });
      return;
    }
    for (const route of routes[index]) {
      if ((blocked & route.edges) !== 0n) continue;
      const next = charges.map((v, i) => v + route.visits[i]);
      if (next.some((v, i) => v > (crystals[i].charges ?? 0))) continue;
      picked.push(route);
      combine(index + 1, blocked | route.blocks, next);
      picked.pop();
      if (overflow) return;
    }
  }
  combine(
    0,
    0n,
    crystals.map(() => 0),
  );
  if (overflow || !solutions) return null;
  const fixed = intersection.reduce(
    (sum, v) => sum + v.toString(2).replace(/0/g, "").length,
    0,
  );
  return {
    routes: routes.map((r) => r.length),
    solutions,
    determinedShare: fixed / (segments / solutions),
    branching: branches / segments,
    sharedCrystals,
    solution,
  };
}
export function routeCells(
  analysis: Analysis,
  channel: Channel,
): readonly Cell[] {
  return analysis.solution.find((b) => b.channel === channel)?.cells ?? [];
}
