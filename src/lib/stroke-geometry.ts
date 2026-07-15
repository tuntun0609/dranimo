import type { BrushSettings, StrokePoint, StrokeRecord } from "./types";

export interface Vec2 {
  x: number;
  y: number;
}

export interface StrokeOutline {
  points: Vec2[];
  bounds: Bounds;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function distance(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function strokeLength(points: StrokePoint[]) {
  return points.reduce(
    (sum, point, index) =>
      index === 0 ? 0 : sum + distance(point, points[index - 1]),
    0,
  );
}

function resample(points: StrokePoint[], streamline: number) {
  if (points.length < 3) return points;
  const amount = clamp(streamline, 0, 1) * 0.78;
  const result = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const previous = result[result.length - 1];
    const point = points[index];
    result.push({
      x: previous.x + (point.x - previous.x) * (1 - amount),
      y: previous.y + (point.y - previous.y) * (1 - amount),
      pressure: point.pressure,
      t: point.t,
    });
  }
  return result;
}

function pointWidth(point: StrokePoint, brush: BrushSettings) {
  const pressure = brush.simulatePressure
    ? clamp(point.pressure || 0.5, 0.08, 1)
    : 0.72;
  const thinning = clamp(brush.thinning, -1, 1);
  const pressureFactor =
    thinning >= 0
      ? 0.5 + pressure * 0.75 * thinning
      : 1 - (1 - pressure) * Math.abs(thinning) * 0.6;
  return Math.max(0.5, brush.size * pressureFactor);
}

function boundsFor(points: Vec2[]): Bounds {
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    {
      minX: points[0].x,
      minY: points[0].y,
      maxX: points[0].x,
      maxY: points[0].y,
    },
  );
}

export function getStrokeOutline(
  points: StrokePoint[],
  brush: BrushSettings,
): StrokeOutline {
  if (!points.length) return { points: [], bounds: boundsFor([]) };
  const sampled = resample(points, brush.streamline);
  if (sampled.length === 1 || strokeLength(sampled) < 0.25) {
    const center = sampled[0];
    const radius = pointWidth(center, brush) / 2;
    const circle = Array.from({ length: 24 }, (_, index) => {
      const angle = (index / 24) * Math.PI * 2;
      return {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      };
    });
    return { points: circle, bounds: boundsFor(circle) };
  }

  const left: Vec2[] = [];
  const right: Vec2[] = [];
  sampled.forEach((point, index) => {
    const before = sampled[Math.max(0, index - 1)];
    const after = sampled[Math.min(sampled.length - 1, index + 1)];
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    const normal = { x: -dy / length, y: dx / length };
    const radius = pointWidth(point, brush) / 2;
    left.push({
      x: point.x + normal.x * radius,
      y: point.y + normal.y * radius,
    });
    right.push({
      x: point.x - normal.x * radius,
      y: point.y - normal.y * radius,
    });
  });

  const outline = [...left];
  const last = sampled[sampled.length - 1];
  const lastRadius = pointWidth(last, brush) / 2;
  const lastBefore = sampled[sampled.length - 2];
  const endAngle = Math.atan2(last.y - lastBefore.y, last.x - lastBefore.x);
  if (brush.capEnd) {
    for (let index = 1; index < 8; index += 1) {
      const angle = endAngle + Math.PI / 2 - (Math.PI * index) / 8;
      outline.push({
        x: last.x + Math.cos(angle) * lastRadius,
        y: last.y + Math.sin(angle) * lastRadius,
      });
    }
  }
  outline.push(...right.reverse());
  const first = sampled[0];
  const firstAfter = sampled[1];
  const firstRadius = pointWidth(first, brush) / 2;
  const startAngle = Math.atan2(firstAfter.y - first.y, firstAfter.x - first.x);
  if (brush.capStart) {
    for (let index = 1; index < 8; index += 1) {
      const angle = startAngle - Math.PI / 2 - (Math.PI * index) / 8;
      outline.push({
        x: first.x + Math.cos(angle) * firstRadius,
        y: first.y + Math.sin(angle) * firstRadius,
      });
    }
  }
  return { points: outline, bounds: boundsFor(outline) };
}

export function outlineToPath(outline: Vec2[]) {
  if (!outline.length) return "";
  const start = outline[0];
  const parts = [`M ${start.x.toFixed(2)} ${start.y.toFixed(2)}`];
  for (let index = 1; index < outline.length; index += 1) {
    const point = outline[index];
    parts.push(`L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

export function strokePath(stroke: StrokeRecord, points = stroke.points) {
  return outlineToPath(getStrokeOutline(points, stroke.brush).points);
}

export function unionBounds(strokes: StrokeRecord[]): Bounds | null {
  const bounds = strokes
    .map((stroke) => getStrokeOutline(stroke.points, stroke.brush).bounds)
    .filter((value) => value.maxX > value.minX || value.maxY > value.minY);
  if (!bounds.length) return null;
  return bounds.reduce(
    (result, value) => ({
      minX: Math.min(result.minX, value.minX),
      minY: Math.min(result.minY, value.minY),
      maxX: Math.max(result.maxX, value.maxX),
      maxY: Math.max(result.maxY, value.maxY),
    }),
    { ...bounds[0] },
  );
}

export function expandBounds(
  bounds: Bounds | null,
  padding: number,
): Bounds | null {
  if (!bounds) return null;
  return {
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding,
  };
}

export function pointHitsStroke(
  point: Vec2,
  stroke: StrokeRecord,
  tolerance = 4,
) {
  if (!stroke.points.length) return false;
  const hitRadius = stroke.brush.size / 2 + tolerance;
  return stroke.points.some((item) => distance(point, item) <= hitRadius);
}
