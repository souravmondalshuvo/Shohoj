/**
 * Paint an ExportPlan onto a 2D canvas (#690).
 *
 * The plan is a display list: `buildExportPlan` in core decides every
 * coordinate, colour and font, and this walks the ops. Rendering lives in the
 * component layer rather than in core — core stays pure, which is why
 * `paintExportPlan` is declared `jsOnly` in the twin contract.
 *
 * That makes this the legacy painter's sibling rather than its twin, so
 * tests/routineExportPainter.test.js drives both against a recording context
 * and requires identical call sequences. Change one, change the other.
 */

import type { DrawOp, ExportPlan } from '../../core/routineExport';

/** The slice of the canvas API the painter needs — and all it may use. */
export interface PaintContext {
  // Typed as the canvas does, so a real CanvasRenderingContext2D satisfies
  // this structurally; the painter only ever assigns strings.
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  measureText(text: string): { width: number };
  roundRect?: (x: number, y: number, w: number, h: number, radius: number) => void;
}

function paintRect(ctx: PaintContext, op: Extract<DrawOp, { type: 'rect' }>): void {
  if (op.fill) ctx.fillStyle = op.fill;
  if (op.radius && typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(op.x, op.y, op.w, op.h, op.radius);
    if (op.fill) ctx.fill();
    if (op.stroke) {
      ctx.strokeStyle = op.stroke;
      ctx.stroke();
    }
    return;
  }
  if (op.fill) ctx.fillRect(op.x, op.y, op.w, op.h);
  if (op.stroke) {
    ctx.strokeStyle = op.stroke;
    ctx.strokeRect(op.x, op.y, op.w, op.h);
  }
}

function paintText(ctx: PaintContext, op: Extract<DrawOp, { type: 'text' }>): void {
  ctx.font = op.font;
  ctx.fillStyle = op.fill;
  ctx.textAlign = op.align;

  if (op.runs && op.align === 'left') {
    // Lay the runs out left to right, measuring as we go — the plan cannot
    // measure, so it hands the painter the pieces. Only the last run is
    // capped, so a long room name condenses on its own instead of squeezing
    // the course code beside it.
    let cursor = op.x;
    const limit = typeof op.maxWidth === 'number' ? op.x + op.maxWidth : Infinity;
    op.runs.forEach((run, i) => {
      ctx.font = run.font || op.font;
      const width = ctx.measureText(run.text).width;
      const room = limit - cursor;
      if (room <= 0) return;
      const isLast = i === op.runs!.length - 1;
      if (isLast && width > room) ctx.fillText(run.text, cursor, op.y, room);
      else ctx.fillText(run.text, cursor, op.y);
      cursor += Math.min(width, room);
    });
    return;
  }

  if (typeof op.maxWidth === 'number') ctx.fillText(op.text, op.x, op.y, op.maxWidth);
  else ctx.fillText(op.text, op.x, op.y);
}

export function paintExportPlan(ctx: PaintContext, plan: ExportPlan): void {
  for (const op of plan.ops) {
    if (op.type === 'rect') {
      paintRect(ctx, op);
    } else if (op.type === 'line') {
      ctx.strokeStyle = op.stroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(op.x1, op.y1);
      ctx.lineTo(op.x2, op.y2);
      ctx.stroke();
    } else if (op.type === 'text') {
      paintText(ctx, op);
    }
  }
}
