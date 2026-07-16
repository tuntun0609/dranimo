import { getVisibleStrokes } from "./playback";
import {
  type Bounds,
  expandBounds,
  getStrokeOutline,
  outlineToPath,
  unionBounds,
} from "./stroke-geometry";
import type {
  CanvasSettings,
  ExportSettings,
  PlaybackSchedule,
  ProjectV1,
  StrokeRecord,
} from "./types";

export interface RenderOptions {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  background?: string;
  strokes: Array<{ stroke: StrokeRecord; points: StrokeRecord["points"] }>;
}

export interface VideoExportOptions {
  onProgress?: (progress: number) => void;
}

const MAX_VIDEO_DURATION_MS = 60_000;
const TRANSPARENCY_PROBE_SIZE = 64;

type TransparentWebMSupport = {
  supported: boolean;
  error?: string;
};

let transparentWebMSupportPromise: Promise<TransparentWebMSupport> | null =
  null;

export function getExportBounds(
  project: ProjectV1,
  settings: ExportSettings,
): Bounds {
  if (settings.crop === "full")
    return {
      minX: 0,
      minY: 0,
      maxX: project.canvas.width,
      maxY: project.canvas.height,
    };
  return (
    expandBounds(unionBounds(project.strokes), settings.padding) ?? {
      minX: 0,
      minY: 0,
      maxX: project.canvas.width,
      maxY: project.canvas.height,
    }
  );
}

export function getExportDimensions(
  project: ProjectV1,
  settings: ExportSettings,
) {
  const bounds = getExportBounds(project, settings);
  const requestedWidth = Math.max(
    1,
    Math.ceil((bounds.maxX - bounds.minX) * settings.scale),
  );
  const requestedHeight = Math.max(
    1,
    Math.ceil((bounds.maxY - bounds.minY) * settings.scale),
  );
  const maxSide = 3840;
  const factor = Math.min(
    1,
    maxSide / Math.max(requestedWidth, requestedHeight),
  );
  let width = Math.max(1, Math.floor(requestedWidth * factor));
  let height = Math.max(1, Math.floor(requestedHeight * factor));
  if (settings.format === "mp4") {
    width += width % 2;
    height += height % 2;
  }
  return {
    width,
    height,
    bounds,
    actualScale: settings.scale * factor,
  };
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  stroke: StrokeRecord,
  points: StrokeRecord["points"],
  scale: number,
  offsetX: number,
  offsetY: number,
) {
  const outline = getStrokeOutline(points, stroke.brush, true).points;
  if (outline.length < 4) return;
  const transformed = outline.map((point) => ({
    x: (point.x - offsetX) * scale,
    y: (point.y - offsetY) * scale,
  }));
  ctx.beginPath();
  ctx.moveTo(transformed[0].x, transformed[0].y);
  for (let index = 1; index < transformed.length - 1; index += 1) {
    const control = transformed[index];
    const next = transformed[index + 1];
    ctx.quadraticCurveTo(
      control.x,
      control.y,
      (control.x + next.x) / 2,
      (control.y + next.y) / 2,
    );
  }
  ctx.closePath();
  ctx.fillStyle = stroke.brush.color;
  ctx.globalAlpha = stroke.brush.opacity;
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  _project: ProjectV1,
  options: RenderOptions,
) {
  ctx.clearRect(0, 0, options.width, options.height);
  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, options.width, options.height);
  }
  options.strokes.forEach(({ stroke, points }) => {
    drawPath(
      ctx,
      stroke,
      points,
      options.scale,
      options.offsetX,
      options.offsetY,
    );
  });
}

export function renderProjectFrame(
  ctx: CanvasRenderingContext2D,
  project: ProjectV1,
  schedule: PlaybackSchedule,
  time: number,
  settings: ExportSettings,
) {
  const { width, height, bounds, actualScale } = getExportDimensions(
    project,
    settings,
  );
  const visible = getVisibleStrokes(schedule, time);
  renderFrame(ctx, project, {
    width,
    height,
    offsetX: bounds.minX,
    offsetY: bounds.minY,
    scale: actualScale,
    background:
      settings.format === "mp4" || settings.background !== "transparent"
        ? project.canvas.backgroundColor
        : undefined,
    strokes: visible,
  });
  return { width, height, bounds, actualScale };
}

export function projectToSvg(
  project: ProjectV1,
  schedule: PlaybackSchedule,
  time: number,
  settings: ExportSettings,
) {
  const { width, height, bounds, actualScale } = getExportDimensions(
    project,
    settings,
  );
  const visible = getVisibleStrokes(schedule, time);
  const paths = visible
    .map(({ stroke, points }) => {
      const outline = getStrokeOutline(points, stroke.brush).points.map(
        (point) => ({
          x: (point.x - bounds.minX) * actualScale,
          y: (point.y - bounds.minY) * actualScale,
        }),
      );
      const path = outlineToPath(outline);
      return `<path d="${path}" fill="${stroke.brush.color}" fill-opacity="${stroke.brush.opacity}"/>`;
    })
    .join("");
  const background =
    settings.background !== "transparent"
      ? `<rect width="100%" height="100%" fill="${project.canvas.backgroundColor}"/>`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${background}${paths}</svg>`;
}

export async function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG 编码失败"))),
      "image/png",
    ),
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface CanvasVideoEncodingOptions {
  format: "webm" | "mp4";
  codec: "vp9" | "avc";
  alpha: "keep" | "discard";
  mimeType: "video/webm" | "video/mp4";
}

async function encodeCanvasVideo(
  canvas: HTMLCanvasElement,
  durationMs: number,
  fps: number,
  render: (timeMs: number) => void,
  encoding: CanvasVideoEncodingOptions,
  onProgress?: (progress: number) => void,
) {
  const {
    BufferTarget,
    CanvasSource,
    Mp4OutputFormat,
    Output,
    QUALITY_HIGH,
    WebMOutputFormat,
  } = await import("mediabunny");
  const target = new BufferTarget();
  const output = new Output({
    format:
      encoding.format === "webm"
        ? new WebMOutputFormat()
        : new Mp4OutputFormat(),
    target,
  });
  const source = new CanvasSource(canvas, {
    codec: encoding.codec,
    bitrate: QUALITY_HIGH,
    alpha: encoding.alpha,
    latencyMode: "quality",
  });
  output.addVideoTrack(source, { frameRate: fps });

  try {
    await output.start();
    const durationSeconds = Math.max(durationMs / 1000, 1 / fps);
    const frameCount = Math.max(1, Math.ceil(durationSeconds * fps));
    let lastReportedPercent = -1;

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const timestamp = frameIndex / fps;
      const frameDuration = Math.min(
        1 / fps,
        Math.max(1 / 1_000_000, durationSeconds - timestamp),
      );
      const timeMs =
        frameIndex === frameCount - 1
          ? durationMs
          : Math.min(durationMs, timestamp * 1000);
      render(timeMs);
      await source.add(timestamp, frameDuration, {
        keyFrame: frameIndex === 0,
      });

      const percent = Math.floor(((frameIndex + 1) / frameCount) * 95);
      if (percent !== lastReportedPercent) {
        lastReportedPercent = percent;
        onProgress?.(percent / 100);
      }
    }

    onProgress?.(0.97);
    await output.finalize();
  } catch (error) {
    await output.cancel();
    throw error;
  }

  if (!target.buffer) throw new Error("视频编码未生成有效文件");
  onProgress?.(1);
  return new Blob([target.buffer], { type: encoding.mimeType });
}

async function probeTransparentWebM(): Promise<TransparentWebMSupport> {
  if (
    typeof document === "undefined" ||
    typeof VideoEncoder === "undefined" ||
    typeof VideoDecoder === "undefined"
  ) {
    return {
      supported: false,
      error: "当前浏览器缺少 WebCodecs，无法导出透明视频",
    };
  }

  try {
    const { BlobSource, canEncodeVideo, Input, VideoSampleSink, WEBM } =
      await import("mediabunny");
    const canEncode = await canEncodeVideo("vp9", {
      width: TRANSPARENCY_PROBE_SIZE,
      height: TRANSPARENCY_PROBE_SIZE,
      bitrate: 400_000,
      alpha: "keep",
    });
    if (!canEncode) {
      return {
        supported: false,
        error: "当前浏览器没有可用的 VP9 编码器",
      };
    }

    const canvas = createExportCanvas({
      width: TRANSPARENCY_PROBE_SIZE,
      height: TRANSPARENCY_PROBE_SIZE,
    });
    const context = canvas.getContext("2d");
    if (!context) {
      return { supported: false, error: "无法创建透明视频检测画布" };
    }
    const drawProbeFrame = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ff2d20";
      context.fillRect(0, 0, canvas.width / 2, canvas.height);
    };
    const blob = await encodeCanvasVideo(canvas, 100, 10, drawProbeFrame, {
      format: "webm",
      codec: "vp9",
      alpha: "keep",
      mimeType: "video/webm",
    });
    const input = new Input({
      source: new BlobSource(blob),
      formats: [WEBM],
    });

    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track || !(await track.canBeTransparent())) {
        return {
          supported: false,
          error: "浏览器生成的 WebM 没有保留 Alpha 通道",
        };
      }
      if (!(await track.canDecode())) {
        return {
          supported: false,
          error: "透明 WebM 已编码，但当前浏览器无法验证解码结果",
        };
      }

      const sample = await new VideoSampleSink(track).getSample(0);
      if (!sample) {
        return { supported: false, error: "透明视频检测无法读取首帧" };
      }

      try {
        const decodedCanvas = createExportCanvas({
          width: TRANSPARENCY_PROBE_SIZE,
          height: TRANSPARENCY_PROBE_SIZE,
        });
        const decodedContext = decodedCanvas.getContext("2d");
        if (!decodedContext) {
          return { supported: false, error: "无法创建透明视频验证画布" };
        }
        decodedContext.clearRect(
          0,
          0,
          decodedCanvas.width,
          decodedCanvas.height,
        );
        sample.draw(
          decodedContext,
          0,
          0,
          decodedCanvas.width,
          decodedCanvas.height,
        );
        const opaqueAlpha = decodedContext.getImageData(16, 32, 1, 1).data[3];
        const transparentAlpha = decodedContext.getImageData(48, 32, 1, 1)
          .data[3];
        if (opaqueAlpha < 240 || transparentAlpha > 16) {
          return {
            supported: false,
            error: "透明 WebM 的 Alpha 像素验证失败",
          };
        }
      } finally {
        sample.close();
      }
    } finally {
      input.dispose();
    }

    return { supported: true };
  } catch (error) {
    return {
      supported: false,
      error:
        error instanceof Error
          ? `透明视频能力检测失败：${error.message}`
          : "透明视频能力检测失败",
    };
  }
}

async function getTransparentWebMSupport() {
  transparentWebMSupportPromise ??= probeTransparentWebM();
  return transparentWebMSupportPromise;
}

export async function supportsTransparentWebM() {
  return (await getTransparentWebMSupport()).supported;
}

export async function exportWebM(
  project: ProjectV1,
  schedule: PlaybackSchedule,
  settings: ExportSettings,
  options: VideoExportOptions = {},
) {
  if (!schedule.valid) {
    throw new Error(schedule.warning ?? "动画时长设置无效");
  }
  if (schedule.duration <= 0) throw new Error("动画没有可导出的内容");
  if (schedule.duration > MAX_VIDEO_DURATION_MS) {
    throw new Error("透明视频最长支持 60 秒");
  }

  options.onProgress?.(0);
  const support = await getTransparentWebMSupport();
  if (!support.supported) {
    throw new Error(support.error ?? "当前浏览器无法导出透明 WebM");
  }

  const dimensions = getExportDimensions(project, settings);
  const canvas = createExportCanvas(dimensions);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建视频导出画布");

  return encodeCanvasVideo(
    canvas,
    schedule.duration,
    settings.fps,
    (timeMs) => {
      renderProjectFrame(context, project, schedule, timeMs, settings);
    },
    {
      format: "webm",
      codec: "vp9",
      alpha: "keep",
      mimeType: "video/webm",
    },
    options.onProgress,
  );
}

export async function exportMP4(
  project: ProjectV1,
  schedule: PlaybackSchedule,
  settings: ExportSettings,
  options: VideoExportOptions = {},
) {
  if (!schedule.valid) {
    throw new Error(schedule.warning ?? "动画时长设置无效");
  }
  if (schedule.duration <= 0) throw new Error("动画没有可导出的内容");
  if (schedule.duration > MAX_VIDEO_DURATION_MS) {
    throw new Error("视频最长支持 60 秒");
  }

  const dimensions = getExportDimensions(project, settings);
  const { canEncodeVideo } = await import("mediabunny");
  const canEncode = await canEncodeVideo("avc", {
    width: dimensions.width,
    height: dimensions.height,
    bitrate: 8_000_000,
  });
  if (!canEncode) {
    throw new Error("当前浏览器没有可用的 H.264/AVC 编码器");
  }

  options.onProgress?.(0);
  const canvas = createExportCanvas(dimensions);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建视频导出画布");

  return encodeCanvasVideo(
    canvas,
    schedule.duration,
    settings.fps,
    (timeMs) => {
      renderProjectFrame(context, project, schedule, timeMs, settings);
    },
    {
      format: "mp4",
      codec: "avc",
      alpha: "discard",
      mimeType: "video/mp4",
    },
    options.onProgress,
  );
}

export function createExportCanvas(dimensions: {
  width: number;
  height: number;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  return canvas;
}

export function canvasSettingsLabel(canvas: CanvasSettings) {
  return `${canvas.width} × ${canvas.height}`;
}
