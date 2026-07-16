import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getStrokeOutline } from "./stroke-geometry";
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
});
