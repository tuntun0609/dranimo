import { getStroke } from "perfect-freehand";
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
  const outline = getStroke(
    points.map(({ x, y, pressure }) => ({ x, y, pressure })),
    {
      size: Math.max(0.1, brush.size),
      thinning: Math.min(1, Math.max(-1, brush.thinning)),
      smoothing: Math.min(1, Math.max(0, brush.smoothing)),
      streamline: Math.min(1, Math.max(0, brush.streamline)),
      easing: (pressure) => pressure,
      simulatePressure: brush.simulatePressure,
      start: {
        cap: brush.capStart,
        taper: Math.max(0, brush.startTaper),
      },
      end: {
        cap: brush.capEnd,
        taper: Math.max(0, brush.endTaper),
      },
      last: true,
    },
  ).map(([x, y]) => ({ x, y }));
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
