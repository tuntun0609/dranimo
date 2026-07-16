import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getExportBackground, renderProjectFrame } from "./export";
import { createDefaultProject, type ExportSettings } from "./types";

const baseSettings: ExportSettings = {
  format: "webm",
  background: "solid",
  crop: "full",
  scale: 1,
  padding: 0,
  fps: 30,
};

function createContextSpy() {
  let fillCount = 0;
  const context = {
    clearRect() {},
    fillRect() {
      fillCount += 1;
    },
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
  return { context, getFillCount: () => fillCount };
}

describe("export background", () => {
  test("keeps solid as the compatibility default", () => {
    assert.equal(
      getExportBackground({ ...baseSettings, background: undefined }),
      "solid",
    );
  });

  test("does not paint a background for transparent WebM", () => {
    const { context, getFillCount } = createContextSpy();
    renderProjectFrame(
      context,
      createDefaultProject(),
      { items: [], duration: 0, valid: true },
      0,
      { ...baseSettings, background: "transparent" },
    );
    assert.equal(getFillCount(), 0);
  });

  test("does not force a background for transparent MP4", () => {
    const { context, getFillCount } = createContextSpy();
    renderProjectFrame(
      context,
      createDefaultProject(),
      { items: [], duration: 0, valid: true },
      0,
      { ...baseSettings, format: "mp4", background: "transparent" },
    );
    assert.equal(getFillCount(), 0);
  });

  test("paints the project color for solid video", () => {
    const { context, getFillCount } = createContextSpy();
    renderProjectFrame(
      context,
      createDefaultProject(),
      { items: [], duration: 0, valid: true },
      0,
      baseSettings,
    );
    assert.equal(getFillCount(), 1);
  });
});
