import { getStroke } from "perfect-freehand";
import { outlineToPath } from "./stroke-geometry";

export interface TrailPoint {
  x: number;
  y: number;
  /** Timestamp (performance.now) used to age the point out of the trail. */
  t: number;
}

/** How long (ms) a point lingers in the eraser trail before fully fading out. */
export const ERASER_TRAIL_DURATION = 200;

/**
 * Drop points older than the trail duration. Points are appended oldest-first,
 * so the expired ones are always at the front and we can slice them off cheaply.
 */
export function pruneTrailPoints(
  points: TrailPoint[],
  now: number,
  duration = ERASER_TRAIL_DURATION,
): TrailPoint[] {
  const cutoff = now - duration;
  let firstLive = 0;
  while (firstLive < points.length && points[firstLive].t < cutoff) {
    firstLive += 1;
  }
  return firstLive === 0 ? points : points.slice(firstLive);
}

/**
 * Build an SVG path for the eraser's comet trail. Newer points sit at the head
 * (full width) while the tail thins as it ages, and points past `duration`
 * drop out entirely so the trail shrinks to nothing when the pointer stops.
 */
export function eraserTrailPath(
  points: TrailPoint[],
  now: number,
  options: { duration?: number; size?: number } = {},
): string {
  const duration = options.duration ?? ERASER_TRAIL_DURATION;
  const size = options.size ?? 12;
  const cutoff = now - duration;
  const active = points.filter((point) => point.t >= cutoff);
  if (active.length < 2) return "";
  const outline = getStroke(
    active.map((point) => ({
      x: point.x,
      y: point.y,
      pressure: Math.max(0, Math.min(1, (point.t - cutoff) / duration)),
    })),
    {
      size,
      thinning: 0.7,
      smoothing: 0.5,
      streamline: 0.35,
      simulatePressure: false,
      last: false,
    },
  ).map(([x, y]) => ({ x, y }));
  return outlineToPath(outline);
}
