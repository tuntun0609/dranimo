import { strokeLength } from "./stroke-geometry";
import type {
  PlaybackSchedule,
  PlaybackSettings,
  StrokePoint,
  StrokeRecord,
} from "./types";

export function buildPlaybackSchedule(
  strokes: StrokeRecord[],
  settings: PlaybackSettings,
): PlaybackSchedule {
  if (!strokes.length) return { items: [], duration: 0, valid: true };
  const gap = Math.max(0, settings.strokeGap);
  const lengths = strokes.map((stroke) =>
    Math.max(strokeLength(stroke.points), stroke.brush.size),
  );
  let durations: number[];
  if (settings.mode === "real") {
    durations = strokes.map((stroke) => {
      const sampled = stroke.points;
      const recorded = sampled.length
        ? Math.max(0, sampled[sampled.length - 1].t - sampled[0].t)
        : 0;
      return Math.max(
        80,
        recorded || (lengths[strokes.indexOf(stroke)] / 600) * 1000,
      );
    });
  } else if (settings.mode === "fixed") {
    const speed = Math.max(1, settings.fixedSpeed);
    durations = lengths.map((length) => Math.max(80, (length / speed) * 1000));
  } else {
    const desired = Math.max(0, settings.totalDuration);
    const totalGaps = gap * Math.max(0, strokes.length - 1);
    if (desired <= totalGaps) {
      return {
        items: [],
        duration: desired,
        valid: false,
        warning: `总时长至少需要 ${Math.ceil(totalGaps + 100)}ms 才能容纳笔画间隔`,
      };
    }
    const available = desired - totalGaps;
    const totalLength = lengths.reduce((sum, length) => sum + length, 0) || 1;
    durations = lengths.map((length) =>
      Math.max(20, (length / totalLength) * available),
    );
  }

  const items: PlaybackSchedule["items"] = [];
  let cursor = 0;
  strokes.forEach((stroke, index) => {
    const draw = durations[index];
    items.push({ stroke, start: cursor, draw, end: cursor + draw });
    cursor += draw;
    if (index < strokes.length - 1) cursor += gap;
  });
  return { items, duration: cursor, valid: true };
}

function lerp(a: number, b: number, amount: number) {
  return a + (b - a) * amount;
}

export function pointsAtTime(
  stroke: StrokeRecord,
  elapsed: number,
  duration: number,
): StrokePoint[] {
  if (!stroke.points.length || elapsed <= 0) return [];
  if (elapsed >= duration || stroke.points.length === 1) return stroke.points;
  const amount = Math.max(0, Math.min(1, elapsed / duration));
  const targetT =
    stroke.points[0].t +
    (stroke.points[stroke.points.length - 1].t - stroke.points[0].t) * amount;
  const visible: StrokePoint[] = [stroke.points[0]];
  for (let index = 1; index < stroke.points.length; index += 1) {
    const previous = stroke.points[index - 1];
    const point = stroke.points[index];
    if (point.t <= targetT) visible.push(point);
    else {
      const span = point.t - previous.t || 1;
      const ratio = Math.max(0, Math.min(1, (targetT - previous.t) / span));
      visible.push({
        x: lerp(previous.x, point.x, ratio),
        y: lerp(previous.y, point.y, ratio),
        pressure: lerp(previous.pressure, point.pressure, ratio),
        t: targetT,
      });
      break;
    }
  }
  return visible;
}

export function getVisibleStrokes(schedule: PlaybackSchedule, time: number) {
  return schedule.items.flatMap((item) => {
    if (time < item.start) return [];
    return [
      {
        stroke: item.stroke,
        points: pointsAtTime(
          item.stroke,
          Math.min(item.draw, time - item.start),
          item.draw,
        ),
      },
    ];
  });
}
