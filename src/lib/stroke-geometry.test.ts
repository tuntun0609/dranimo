import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getStrokeOutline, outlineToPath } from "./stroke-geometry";
import type { BrushSettings, StrokePoint } from "./types";

const brush: BrushSettings = {
  color: "#000000",
  size: 20,
  opacity: 1,
  thinning: 0,
  smoothing: 0.5,
  streamline: 0,
  simulatePressure: false,
  startTaper: 0,
  endTaper: 0,
  capStart: true,
  capEnd: true,
};

const point = (x: number, y: number, t: number): StrokePoint => ({
  x,
  y,
  pressure: 0.5,
  t,
});

describe("getStrokeOutline", () => {
  test("round caps extend outward without folding into the stroke", () => {
    const outline = getStrokeOutline(
      [point(10, 20, 0), point(30, 20, 10)],
      brush,
    ).points;

    const endExtension = Math.max(...outline.map(({ x }) => x)) - 30;
    const startExtension = 10 - Math.min(...outline.map(({ x }) => x));
    assert.ok(endExtension > 0);
    assert.ok(Math.abs(endExtension - startExtension) < 0.2);
  });

  test("advanced geometry settings change the generated outline", () => {
    const points = Array.from({ length: 20 }, (_, index) =>
      point(index * 6, Math.sin(index * 1.7) * 14 + 50, index * 10),
    );
    const smoothed = getStrokeOutline(points, { ...brush, smoothing: 1 });
    const unsmoothed = getStrokeOutline(points, { ...brush, smoothing: 0 });
    const streamlined = getStrokeOutline(points, { ...brush, streamline: 1 });

    assert.notDeepEqual(smoothed.points, unsmoothed.points);
    assert.notDeepEqual(streamlined.points, unsmoothed.points);
  });

  test("live strokes trail the pointer until the stroke is complete", () => {
    const points = Array.from({ length: 8 }, (_, index) =>
      point(index * 20, 20, index * 10),
    );
    const live = getStrokeOutline(
      points,
      { ...brush, streamline: 0.5 },
      false,
    ).points;
    const complete = getStrokeOutline(
      points,
      { ...brush, streamline: 0.5 },
      true,
    ).points;

    assert.notDeepEqual(live, complete);
    assert.ok(
      Math.max(...complete.map(({ x }) => x)) >
        Math.max(...live.map(({ x }) => x)),
    );
  });

  test("creates a smooth quadratic path instead of a line polygon", () => {
    const path = outlineToPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ]);

    assert.match(path, /^M .* Q .* T .* Z$/);
    assert.doesNotMatch(path, / L /);
  });
});
