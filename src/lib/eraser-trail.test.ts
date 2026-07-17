import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ERASER_TRAIL_DURATION,
  eraserTrailPath,
  pruneTrailPoints,
  type TrailPoint,
} from "./eraser-trail";

// Derive coordinates from `t` so a given timestamp always maps to the same
// point regardless of its position in the array — that lets the pruning test
// compare paths that should share identical surviving points.
const trail = (...ts: number[]): TrailPoint[] =>
  ts.map((t) => ({ x: t / 10, y: 20, t }));

describe("pruneTrailPoints", () => {
  test("drops points older than the trail duration", () => {
    const now = 1000;
    const points = trail(400, 650, 900, 1000);
    // Explicit 400ms window (cutoff = 600) so the test is independent of the
    // tuning constant: only the point at t=400 falls outside it.
    const pruned = pruneTrailPoints(points, now, 400);
    assert.deepEqual(
      pruned.map((point) => point.t),
      [650, 900, 1000],
    );
  });

  test("returns the same array reference when nothing expired", () => {
    const now = 1000;
    const points = trail(900, 950, 1000);
    assert.equal(pruneTrailPoints(points, now, 400), points);
  });

  test("empties out once every point ages past the window", () => {
    const points = trail(100, 200, 300);
    assert.deepEqual(pruneTrailPoints(points, 1000, 400), []);
  });

  test("uses ERASER_TRAIL_DURATION as the default window", () => {
    const now = 1000;
    const points = trail(now - ERASER_TRAIL_DURATION - 1, now - 10, now);
    const pruned = pruneTrailPoints(points, now);
    // The point just past the default window drops; the two recent ones stay.
    assert.deepEqual(
      pruned.map((point) => point.t),
      [now - 10, now],
    );
  });
});

describe("eraserTrailPath", () => {
  test("returns an empty path without at least two live points", () => {
    assert.equal(eraserTrailPath([], 1000), "");
    assert.equal(eraserTrailPath(trail(1000), 1000), "");
  });

  test("builds a smooth path for a live trail", () => {
    const now = 1000;
    const points = trail(800, 870, 940, 1000);
    const path = eraserTrailPath(points, now, { duration: 400 });
    assert.match(path, /^M .* Q .* T .* Z$/);
  });

  test("excludes expired points from the rendered trail", () => {
    const now = 1000;
    // Only the last two points are within the 400ms window.
    const fresh = eraserTrailPath(trail(700, 1000), now, { duration: 400 });
    const withStale = eraserTrailPath(trail(100, 200, 700, 1000), now, {
      duration: 400,
    });
    assert.equal(withStale, fresh);
  });
});
