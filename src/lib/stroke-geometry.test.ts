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

    const endCap = outline.slice(2, 9);
    const startCap = outline.slice(11);

    assert.equal(endCap.length, 7);
    assert.equal(startCap.length, 7);
    assert.ok(endCap.every(({ x }) => x > 30));
    assert.ok(startCap.every(({ x }) => x < 10));
    const endExtension = Math.max(...endCap.map(({ x }) => x)) - 30;
    const startExtension = 10 - Math.min(...startCap.map(({ x }) => x));
    assert.ok(endExtension > 0);
    assert.ok(Math.abs(endExtension - startExtension) < 1e-8);
  });
});
