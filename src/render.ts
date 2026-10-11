import type { RefractState, Channel, Target, NodeState } from "./game";
import { BACKGROUND, menuItems, targets } from "./game";
import {
  BACK_LABEL,
  BINDINGS,
  CAMPAIGN_LENGTH,
  CELL_PITCH,
  CHANNELS,
  CLEAR_LABEL,
  HUD_SOLVED_LABEL,
  HUD_TIER_LABEL,
  NODE_R,
  SET_LABELS,
  SOLVED_TITLE_TEXT,
  STAGE_H,
  STAGE_W,
  TAGLINE_TEXT,
  TITLE_TEXT,
} from "./constants";
import { SET_SIZE } from "./campaign";
import { cellX, cellY, complete, same, spent } from "./rules";

const INK = "#e9f2ef",
  MUTED = "#8093a4",
  LINE = "#263642",
  ACCENT = "#bdf8dd";
export const HUES: Record<Channel, string> = {
  triangle: "#77f5cd",
  square: "#ffbd79",
  diamond: "#b6a2ff",
};
type Ctx = CanvasRenderingContext2D;
const keyLabel = (action: keyof typeof BINDINGS) =>
  BINDINGS[action][0].replace("Key", "").replace("Escape", "ESC");
function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  size = 14,
  color = MUTED,
  align: CanvasTextAlign = "left",
  font = "monospace",
) {
  ctx.font = `${font === "sans-serif" ? "500" : "400"} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}
function tracked(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  size: number,
  gap: number,
  color: string,
) {
  ctx.font = `500 ${size}px sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  for (const ch of value) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + gap;
  }
}
function line(
  ctx: Ctx,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color = LINE,
  width = 1,
) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
function box(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke?: string,
  r = 8,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
function shape(ctx: Ctx, ch: Channel, x: number, y: number, r: number) {
  ctx.beginPath();
  if (ch === "triangle") {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.866, y + r * 0.5);
    ctx.lineTo(x - r * 0.866, y + r * 0.5);
  } else if (ch === "square")
    ctx.rect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);
  else {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
  }
  ctx.closePath();
}
function node(
  ctx: Ctx,
  n: NodeState,
  x: number,
  y: number,
  used: number,
  active: boolean,
) {
  const hue = n.channel ? HUES[n.channel] : "#d7e9f8";
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, NODE_R, 0, Math.PI * 2);
  ctx.fillStyle = "#0d1923";
  ctx.fill();
  ctx.strokeStyle = active ? hue : "#20313d";
  ctx.lineWidth = 1;
  ctx.stroke();
  if (n.kind === "crystal") {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const px = x + 24 * Math.cos(angle),
        py = y + 24 * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = used === n.charges ? "#243b49" : "#142432";
    ctx.fill();
    ctx.strokeStyle = used ? "#c3e5f1" : "#6c8797";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, `${used}/${n.charges}`, x, y, 13, INK, "center");
    for (let i = 0; i < (n.charges ?? 0); i++) {
      ctx.beginPath();
      ctx.arc(
        x + (i - ((n.charges ?? 0) - 1) / 2) * 8,
        y + 16,
        2,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = i < used ? ACCENT : "#445361";
      ctx.fill();
    }
  } else if (n.channel) {
    ctx.shadowColor = hue;
    ctx.shadowBlur = active ? 18 : 7;
    shape(ctx, n.channel, x, y, 22);
    ctx.strokeStyle = hue;
    ctx.lineWidth = 2.2;
    ctx.fillStyle = n.kind === "lens" ? hue : "#0b1720";
    ctx.fill();
    ctx.stroke();
    if (n.kind === "emitter") {
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = hue;
      ctx.fill();
    }
  }
  ctx.restore();
}
function background(ctx: Ctx) {
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  const gradient = ctx.createRadialGradient(720, 340, 20, 720, 340, 720);
  gradient.addColorStop(0, "#132432");
  gradient.addColorStop(1, BACKGROUND);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  for (let x = 32; x < STAGE_W; x += 32)
    for (let y = 24; y < STAGE_H; y += 32) {
      ctx.fillStyle = "#536c7b15";
      ctx.fillRect(x, y, 1, 1);
    }
  line(ctx, 48, STAGE_H - 42, STAGE_W - 48, STAGE_H - 42);
  text(ctx, "REFRACT / OPTICAL PUZZLES", 48, STAGE_H - 21, 10, "#607683");
  text(
    ctx,
    `${keyLabel("mute")}  SOUND · ${keyLabel("back")}  BACK`,
    STAGE_W - 48,
    STAGE_H - 21,
    10,
    "#607683",
    "right",
  );
}
function control(
  ctx: Ctx,
  t: Target,
  label: string,
  selected = false,
  detail?: string,
) {
  box(
    ctx,
    t.x,
    t.y,
    t.w,
    t.h,
    selected ? "#17362f" : "#101c26",
    selected ? "#70c6a9" : LINE,
    5,
  );
  text(ctx, label, t.x + 22, t.y + t.h / 2, 14, selected ? ACCENT : INK);
  if (detail)
    text(
      ctx,
      detail,
      t.x + t.w - 18,
      t.y + t.h / 2,
      12,
      selected ? ACCENT : MUTED,
      "right",
    );
}
function title(ctx: Ctx, s: RefractState) {
  text(ctx, "A STUDY IN CONNECTION", 100, 116, 12, ACCENT);
  tracked(ctx, TITLE_TEXT, 94, 218, 86, 5, INK);
  tracked(ctx, TAGLINE_TEXT, 101, 292, 15, 5, MUTED);
  targets(s).forEach((t, i) =>
    control(
      ctx,
      t,
      menuItems(s)[i],
      s.menuIndex === i,
      [`${CAMPAIGN_LENGTH} BOARDS`, "ENDLESS", "THE BASICS"][i],
    ),
  );
  text(
    ctx,
    "One line. Every lens. A little illumination.",
    100,
    632,
    13,
    MUTED,
  );
  // An original optical diagram: three spectra threaded through one prism.
  const cx = 918,
    cy = 329;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.12);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, 137 + i * 24, 0, Math.PI * 2);
    ctx.strokeStyle = i === 3 ? "#29404c" : "#1c303d";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  for (let i = 0; i < 48; i++) {
    const a = (i * Math.PI) / 24;
    line(
      ctx,
      Math.cos(a) * 205,
      Math.sin(a) * 205,
      Math.cos(a) * (i % 4 ? 210 : 218),
      Math.sin(a) * (i % 4 ? 210 : 218),
      "#45616d",
      1,
    );
  }
  const paths = [
    [
      [-210, 100],
      [-135, 100],
      [-60, 25],
      [55, 25],
      [130, -50],
      [206, -50],
    ],
    [
      [-212, -65],
      [-133, -65],
      [-55, 12],
      [48, 12],
      [137, 101],
      [213, 101],
    ],
    [
      [-140, -172],
      [-140, -112],
      [-42, -14],
      [35, -14],
      [125, -104],
      [125, -171],
    ],
  ];
  paths.forEach((path, i) => {
    const hue = HUES[CHANNELS[i]];
    ctx.beginPath();
    path.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.lineWidth = 3;
    ctx.strokeStyle = hue;
    ctx.shadowBlur = 18;
    ctx.shadowColor = hue;
    ctx.stroke();
    ctx.shadowBlur = 0;
    path.forEach(([x, y], j) => {
      if (j === 0 || j === path.length - 1) {
        shape(ctx, CHANNELS[i], x, y, 17);
        ctx.fillStyle = "#0c1720";
        ctx.fill();
        ctx.strokeStyle = hue;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  });
  ctx.beginPath();
  ctx.moveTo(0, -94);
  ctx.lineTo(86, 60);
  ctx.lineTo(-86, 60);
  ctx.closePath();
  const g = ctx.createLinearGradient(-60, -60, 60, 60);
  g.addColorStop(0, "#d4fff32b");
  g.addColorStop(0.5, "#a4deee12");
  g.addColorStop(1, "#b7b3ff38");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "#b8d8dc";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  line(ctx, 0, -94, 0, 25, "#acdade55");
  line(ctx, -86, 60, 0, 25, "#acdade55");
  line(ctx, 86, 60, 0, 25, "#acdade55");
  ctx.restore();
  text(ctx, "01 / THE OPTICAL BENCH", cx, 610, 11, MUTED, "center");
  line(ctx, 686, 630, 1150, 630, "#2b424e");
}
function board(ctx: Ctx, s: RefractState) {
  const { cols, rows } = s.board;
  box(ctx, 312, 120, 656, 544, "#0b1620", "#2b3e4b", 12);
  for (const [x, y] of [
    [325, 133],
    [955, 133],
    [325, 651],
    [955, 651],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.strokeStyle = "#46606c";
    ctx.stroke();
    line(ctx, x - 2, y, x + 2, y, "#46606c");
  }
  for (let col = 0; col < cols; col++)
    for (let row = 0; row < rows; row++) {
      const x = cellX(col, cols),
        y = cellY(row, rows);
      if (col < cols - 1) line(ctx, x, y, x + CELL_PITCH, y, "#172b38");
      if (row < rows - 1) line(ctx, x, y, x, y + CELL_PITCH, "#172b38");
      line(ctx, x - 3, y, x + 3, y, "#30424d");
      line(ctx, x, y - 3, x, y + 3, "#30424d");
    }
  s.beams.forEach((b) => {
    if (b.cells.length < 2) return;
    const hue = HUES[b.channel];
    ctx.save();
    ctx.beginPath();
    b.cells.forEach((c, i) => {
      const x = cellX(c.col, cols),
        y = cellY(c.row, rows);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = hue;
    ctx.shadowColor = hue;
    ctx.shadowBlur = 16;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#f2fff8a0";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  });
  const live = s.beams.find((b) => b.channel === s.tracing?.channel)?.cells;
  s.board.nodes.forEach((n) =>
    node(
      ctx,
      n,
      cellX(n.col, cols),
      cellY(n.row, rows),
      spent(s.beams, n),
      !!live && same(live[live.length - 1], n),
    ),
  );
}
function playing(ctx: Ctx, s: RefractState) {
  board(ctx, s);
  text(
    ctx,
    s.mode === "campaign"
      ? `CAMPAIGN / ${SET_LABELS[Math.floor(s.boardIndex / SET_SIZE)]}`
      : "CASCADE / ENDLESS LIGHT",
    640,
    55,
    12,
    ACCENT,
    "center",
  );
  text(
    ctx,
    s.mode === "campaign"
      ? `Board ${String(s.boardIndex + 1).padStart(2, "0")}`
      : `${HUD_TIER_LABEL} ${s.tier}    /    ${HUD_SOLVED_LABEL} ${s.solvedCount}`,
    640,
    87,
    24,
    INK,
    "center",
    "sans-serif",
  );
  text(ctx, "CHANNELS", 68, 199, 11, MUTED);
  s.beams.forEach((b, i) => {
    const y = 251 + i * 86,
      done = complete(s.board, b);
    shape(ctx, b.channel, 86, y, 14);
    ctx.fillStyle = done ? HUES[b.channel] : "#10232c";
    ctx.fill();
    ctx.strokeStyle = HUES[b.channel];
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, b.channel.toUpperCase(), 116, y - 8, 12, HUES[b.channel]);
    text(
      ctx,
      done ? "CONNECTED ✓" : "AWAITING LIGHT",
      116,
      y + 15,
      10,
      done ? INK : MUTED,
    );
  });
  text(ctx, "THE OBJECTIVE", 68, 527, 11, MUTED);
  text(ctx, "Link the two emitters.", 68, 557, 12, INK);
  text(ctx, "Thread every lens.", 68, 578, 12, INK);
  text(ctx, "Spend every charge.", 68, 599, 12, INK);
  if (s.screen === "playing") {
    text(ctx, "PRESS + TRACE", 1000, 232, 12, ACCENT);
    text(ctx, "Begin at an outline.", 1000, 263, 12, INK);
    text(ctx, "Follow nearby nodes.", 1000, 284, 12, INK);
    line(ctx, 1000, 314, 1218, 314);
    text(ctx, "CHANGE YOUR MIND", 1000, 349, 11, MUTED);
    text(ctx, "Trace backward to undo.", 1000, 379, 12, INK);
    text(ctx, "Release to keep a beam.", 1000, 400, 12, INK);
    text(ctx, "Grab it again to edit.", 1000, 421, 12, INK);
    targets(s).forEach((t) =>
      control(
        ctx,
        t,
        t.id === "clear" ? CLEAR_LABEL : BACK_LABEL,
        false,
        t.id === "clear" ? BINDINGS.clear[0].replace("Key", "") : "←",
      ),
    );
    text(
      ctx,
      `${s.board.cols} × ${s.board.rows} / NODE LATTICE`,
      640,
      699,
      9,
      "#536f7d",
      "center",
    );
  } else {
    text(
      ctx,
      s.screen === "complete" ? "ALL LIGHT CONNECTED" : SOLVED_TITLE_TEXT,
      1000,
      182,
      17,
      ACCENT,
    );
    text(
      ctx,
      s.screen === "complete"
        ? `${CAMPAIGN_LENGTH} boards solved`
        : s.mode === "campaign"
          ? `Board ${s.boardIndex + 1} complete`
          : `${HUD_SOLVED_LABEL} ${s.solvedCount}`,
      1000,
      220,
      15,
      INK,
    );
    text(ctx, "A beautiful connection.", 1000, 257, 12, MUTED);
    targets(s).forEach((t, i) =>
      control(ctx, t, menuItems(s)[i], s.menuIndex === i),
    );
  }
}
function selection(ctx: Ctx, s: RefractState) {
  text(ctx, "THE CAMPAIGN", 640, 112, 12, ACCENT, "center");
  tracked(ctx, "24 STUDIES IN LIGHT", 355, 159, 32, 2, INK);
  const ts = targets(s);
  SET_LABELS.forEach((label, row) =>
    text(ctx, label, 156, 260 + row * 98, 12, MUTED),
  );
  ts.slice(0, CAMPAIGN_LENGTH).forEach((t, i) => {
    const done = s.solvedBoards.includes(i),
      locked = i >= s.unlockedCount,
      selected = s.selectIndex === i;
    box(
      ctx,
      t.x,
      t.y,
      t.w,
      t.h,
      selected ? "#20342f" : locked ? "#0e1922" : "#162730",
      selected ? ACCENT : LINE,
      5,
    );
    text(
      ctx,
      String(i + 1).padStart(2, "0"),
      t.x + 22,
      t.y + 29,
      24,
      locked ? "#637582" : INK,
      "left",
      "sans-serif",
    );
    text(
      ctx,
      done ? "SOLVED ✓" : locked ? "LOCKED" : "OPEN",
      t.x + 22,
      t.y + 60,
      10,
      done ? ACCENT : locked ? "#637582" : MUTED,
    );
    if (locked) {
      ctx.strokeStyle = "#637582";
      ctx.lineWidth = 1;
      ctx.strokeRect(t.x + 79, t.y + 29, 10, 8);
      ctx.beginPath();
      ctx.arc(t.x + 84, t.y + 29, 4, Math.PI, 0);
      ctx.stroke();
    }
  });
  control(ctx, ts[ts.length - 1], BACK_LABEL, false, "←");
  text(
    ctx,
    `${s.solvedBoards.length} / ${CAMPAIGN_LENGTH} ILLUMINATED`,
    640,
    638,
    12,
    ACCENT,
    "center",
  );
}
function howto(ctx: Ctx, s: RefractState) {
  control(ctx, targets(s)[0], BACK_LABEL, false, "←");
  text(ctx, "THE ART OF CONNECTION", 640, 100, 12, ACCENT, "center");
  text(ctx, TAGLINE_TEXT, 640, 152, 40, INK, "center", "sans-serif");
  const cards = [
    [
      "01",
      "FIND YOUR CHANNEL",
      "Each color has two outlined emitters.",
      "Press an emitter and drag through nodes.",
      "Connect its pair, threading every filled lens.",
    ],
    [
      "02",
      "MAKE A PATH",
      "Reach any of the eight neighboring nodes.",
      "Diagonals work; empty cells cannot be crossed.",
      "Other channels’ emitters and lenses are off limits.",
    ],
    [
      "03",
      "SPEND THE LIGHT",
      "Crystals belong to every channel.",
      "Each entry spends one charge; always leave again.",
      "Spend every charge, exactly, to finish the board.",
    ],
    [
      "04",
      "LEAVE ROOM TO RETHINK",
      "No segment can be used twice or shared.",
      "Diagonals cannot cross. Illegal moves simply stop.",
      "Release to keep a beam. Grab an end to continue.",
    ],
  ];
  cards.forEach(([number, heading, ...lines], i) => {
    const x = 100 + (i % 2) * 560,
      y = 219 + Math.floor(i / 2) * 177;
    box(ctx, x, y, 520, 153, "#101d28", LINE);
    text(ctx, number, x + 24, y + 29, 12, ACCENT);
    text(ctx, heading, x + 60, y + 29, 14, INK);
    lines.forEach((v, j) => text(ctx, v, x + 24, y + 65 + j * 24, 12, MUTED));
  });
  text(
    ctx,
    `Retrace to undo  ·  ${keyLabel("clear")} clear board  ·  Arrow keys + Enter menus  ·  ${keyLabel("mute")} sound  ·  ${keyLabel("back")} back`,
    640,
    624,
    12,
    INK,
    "center",
  );
}
export function draw(s: RefractState, ctx: Ctx): void {
  ctx.save();
  background(ctx);
  if (s.screen === "title") title(ctx, s);
  else if (s.screen === "howto") howto(ctx, s);
  else if (s.screen === "select") selection(ctx, s);
  else playing(ctx, s);
  text(
    ctx,
    s.muted ? "SOUND OFF" : "SOUND ON",
    STAGE_W - 48,
    24,
    9,
    MUTED,
    "right",
  );
  ctx.restore();
}
