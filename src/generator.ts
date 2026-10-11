import { CHANNELS, TIERS, type Tier } from "./constants";
import { parseBoard } from "./rules";
import { analyze } from "./solver";
import pools from "./cascade-pool.json";
import type { BoardState } from "./game";

export function meetsFloor(board: BoardState, tier: Tier): boolean {
  const crystals = board.nodes.filter((n) => n.kind === "crystal");
  if (
    board.cols * board.rows - board.nodes.length > tier.maxEmptyCells ||
    crystals.length < tier.minCrystals ||
    crystals.length > tier.maxCrystals ||
    crystals.some(
      (n) =>
        (n.charges ?? 0) < tier.minCharges ||
        (n.charges ?? 0) > tier.maxCharges,
    )
  )
    return false;
  const result = analyze(board, 60000);
  return (
    !!result &&
    result.routes.every((n) => n >= tier.minRoutes) &&
    result.solutions >= tier.minSolutions &&
    result.solutions <= tier.maxSolutions &&
    result.determinedShare <= tier.maxDeterminedShare &&
    result.branching >= tier.minBranching &&
    result.sharedCrystals >= tier.minSharedCrystals
  );
}
const randomIndex = (length: number) => Math.floor(Math.random() * length);
/**
 * Choose independent dimensions, then vary a certified seed's nodes and charges.
 * Every proposal is exhaustively checked before emission. A bounded search keeps
 * generation responsive; rejected proposals leave the certified seed available.
 */
export function generate(tier: number): BoardState {
  const t = TIERS[tier - 1];
  if (!t) throw new RangeError("Unknown Cascade tier");
  const cols = t.minCols + randomIndex(t.maxCols - t.minCols + 1);
  const rows = t.minRows + randomIndex(t.maxRows - t.minRows + 1);
  const pool = pools.find(
    (p) => p.tier === tier && p.cols === cols && p.rows === rows,
  );
  if (!pool) throw new Error("Missing certified Cascade size");
  const seed = pool.boards[randomIndex(pool.boards.length)];
  for (let attempt = 0; attempt < 4; attempt++) {
    const cells = seed.join("").split("");
    const a = randomIndex(cells.length),
      b = randomIndex(cells.length);
    if (Math.random() < 0.6) [cells[a], cells[b]] = [cells[b], cells[a]];
    else if (!/[TSD]/.test(cells[a])) {
      const options = [
        ".",
        ...CHANNELS.slice(0, t.channels).map((ch) => ch[0]),
      ];
      for (
        let charge = t.minCharges;
        charge <= t.maxCharges && charge > 0;
        charge++
      )
        options.push(String(charge));
      cells[a] = options[randomIndex(options.length)];
    }
    const board = parseBoard(
      Array.from({ length: rows }, (_, row) =>
        cells.slice(row * cols, (row + 1) * cols).join(""),
      ),
    );
    if (meetsFloor(board, t)) return board;
  }
  return parseBoard(seed);
}
