import { getVisibleStrokes } from "./playback";
import {
  type Bounds,
  expandBounds,
  getStrokeOutline,
  outlineToPath,
  unionBounds,
} from "./stroke-geometry";
import type {
  BackgroundMode,
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
const PRORES_4444_CODEC = "ap4h";

export type TransparentVideoSupport = {
  supported: boolean;
  error?: string;
};

let transparentWebMSupportPromise: Promise<TransparentVideoSupport> | null =
  null;
let transparentMP4SupportPromise: Promise<TransparentVideoSupport> | null =
  null;

export function getExportBackground(settings: ExportSettings): BackgroundMode {
  return settings.background ?? "solid";
}

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
  if (settings.format === "mp4" || settings.format === "mov") {
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
      getExportBackground(settings) === "solid"
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
    getExportBackground(settings) === "solid"
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
  codec: "vp9" | "avc" | "prores";
  alpha: "keep" | "discard";
  mimeType: "video/webm" | "video/mp4";
  bitrate?: number;
  fullCodecString?: string;
}

interface AlphaReference {
  x: number;
  y: number;
  alpha: number;
}

function getVideoFrameTiming(
  frameIndex: number,
  frameCount: number,
  durationMs: number,
  fps: number,
) {
  const durationSeconds = Math.max(durationMs / 1000, 1 / fps);
  const timestamp = frameIndex / fps;
  const duration = Math.min(
    1 / fps,
    Math.max(1 / 1_000_000, durationSeconds - timestamp),
  );
  const timeMs =
    frameIndex === frameCount - 1
      ? durationMs
      : Math.min(durationMs, timestamp * 1000);
  return { timestamp, duration, timeMs };
}

function getFrameCount(durationMs: number, fps: number) {
  return Math.max(1, Math.ceil(Math.max(durationMs / 1000, 1 / fps) * fps));
}

function reportFrameProgress(
  frameIndex: number,
  frameCount: number,
  lastReportedPercent: number,
  onProgress?: (progress: number) => void,
) {
  const percent = Math.floor(((frameIndex + 1) / frameCount) * 95);
  if (percent !== lastReportedPercent) onProgress?.(percent / 100);
  return percent;
}

async function encodeCanvasVideo(
  canvas: HTMLCanvasElement,
  durationMs: number,
  fps: number,
  render: (timeMs: number) => void,
  encoding: CanvasVideoEncodingOptions,
  onProgress?: (progress: number) => void,
) {
  if (encoding.codec === "prores") {
    return encodeProResCanvasVideo(
      canvas,
      durationMs,
      fps,
      render,
      encoding,
      onProgress,
    );
  }

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
    bitrate: encoding.bitrate ?? QUALITY_HIGH,
    alpha: encoding.alpha,
    latencyMode: "quality",
    fullCodecString: encoding.fullCodecString,
  });
  output.addVideoTrack(source, { frameRate: fps });

  try {
    await output.start();
    const frameCount = getFrameCount(durationMs, fps);
    let lastReportedPercent = -1;

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const { timestamp, duration, timeMs } = getVideoFrameTiming(
        frameIndex,
        frameCount,
        durationMs,
        fps,
      );
      render(timeMs);
      await source.add(timestamp, duration, {
        keyFrame: frameIndex === 0,
      });

      lastReportedPercent = reportFrameProgress(
        frameIndex,
        frameCount,
        lastReportedPercent,
        onProgress,
      );
    }

    onProgress?.(0.97);
    await output.finalize();
  } catch (error) {
    await output.cancel();
    throw error;
  }

  if (!target.buffer) throw new Error("视频编码未生成有效文件");
  return new Blob([target.buffer], { type: encoding.mimeType });
}

function getProResBitrate(width: number, height: number, fps: number) {
  const referencePixelsPerSecond = 1920 * 1080 * 30;
  const pixelsPerSecond = width * height * fps;
  return Math.max(
    5_000_000,
    Math.round(330_000_000 * (pixelsPerSecond / referencePixelsPerSecond)),
  );
}

async function encodeProResCanvasVideo(
  canvas: HTMLCanvasElement,
  durationMs: number,
  fps: number,
  render: (timeMs: number) => void,
  encoding: CanvasVideoEncodingOptions,
  onProgress?: (progress: number) => void,
) {
  if (encoding.format !== "mp4" || encoding.alpha !== "keep") {
    throw new Error("ProRes 4444 仅用于透明 MP4 导出");
  }
  if (
    typeof VideoEncoder === "undefined" ||
    typeof VideoFrame === "undefined"
  ) {
    throw new Error("当前浏览器缺少 WebCodecs 视频编码能力");
  }

  const {
    BufferTarget,
    EncodedPacket,
    EncodedVideoPacketSource,
    Mp4OutputFormat,
    Output,
  } = await import("mediabunny");
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat(),
    target,
  });
  const source = new EncodedVideoPacketSource("prores");
  output.addVideoTrack(source, { frameRate: fps });

  const encoderConfig: VideoEncoderConfig = {
    codec: encoding.fullCodecString ?? PRORES_4444_CODEC,
    width: canvas.width,
    height: canvas.height,
    bitrate:
      encoding.bitrate ?? getProResBitrate(canvas.width, canvas.height, fps),
    framerate: fps,
    alpha: "keep",
    latencyMode: "quality",
  };
  const support = await VideoEncoder.isConfigSupported(encoderConfig);
  if (!support.supported || support.config?.alpha !== "keep") {
    throw new Error("当前浏览器不支持 ProRes 4444 Alpha 编码");
  }

  let encoderError: unknown = null;
  let muxPromise = Promise.resolve();
  // MP4 cannot store MediaBunny's VP9-style alpha side data. ProRes must
  // therefore be encoded with its alpha plane kept in-band by WebCodecs.
  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {
      const packet = EncodedPacket.fromEncodedChunk(chunk);
      muxPromise = muxPromise
        .then(() => source.add(packet, metadata))
        .catch((error: unknown) => {
          encoderError ??= error;
        });
    },
    error: (error) => {
      encoderError ??= error;
    },
  });

  try {
    await output.start();
    encoder.configure(support.config ?? encoderConfig);
    const frameCount = getFrameCount(durationMs, fps);
    let lastReportedPercent = -1;

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const { timestamp, duration, timeMs } = getVideoFrameTiming(
        frameIndex,
        frameCount,
        durationMs,
        fps,
      );
      render(timeMs);
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(timestamp * 1_000_000),
        duration: Math.max(1, Math.round(duration * 1_000_000)),
      });
      encoder.encode(frame, { keyFrame: true });
      frame.close();

      if (encoder.encodeQueueSize >= 4) {
        await new Promise<void>((resolve) =>
          encoder.addEventListener("dequeue", () => resolve(), { once: true }),
        );
      }
      if (encoderError) throw encoderError;

      lastReportedPercent = reportFrameProgress(
        frameIndex,
        frameCount,
        lastReportedPercent,
        onProgress,
      );
    }

    await encoder.flush();
    await muxPromise;
    if (encoderError) throw encoderError;
    onProgress?.(0.97);
    await output.finalize();
  } catch (error) {
    if (encoder.state !== "closed") encoder.close();
    await output.cancel();
    throw error;
  }

  if (encoder.state !== "closed") encoder.close();
  if (!target.buffer) throw new Error("ProRes 4444 编码未生成有效文件");
  return new Blob([target.buffer], { type: encoding.mimeType });
}

function getAlphaReferences(canvas: HTMLCanvasElement): AlphaReference[] {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法读取透明视频验证画布");
  const fractions = [0.05, 0.25, 0.5, 0.75, 0.95];
  return fractions.flatMap((yFraction) =>
    fractions.map((xFraction) => {
      const x = Math.min(
        canvas.width - 1,
        Math.floor(canvas.width * xFraction),
      );
      const y = Math.min(
        canvas.height - 1,
        Math.floor(canvas.height * yFraction),
      );
      return { x, y, alpha: context.getImageData(x, y, 1, 1).data[3] };
    }),
  );
}

async function verifyTransparentVideoBlob(
  blob: Blob,
  format: "webm" | "mp4",
  references: AlphaReference[],
) {
  const { BlobSource, CanvasSink, Input, MP4, WEBM } = await import(
    "mediabunny"
  );
  const formatLabel = format === "webm" ? "WebM" : "MP4";
  const input = new Input({
    source: new BlobSource(blob),
    formats: [format === "webm" ? WEBM : MP4],
  });

  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canBeTransparent())) {
      throw new Error(`${formatLabel} 文件没有透明视频轨道`);
    }
    if (!(await track.canDecode())) {
      throw new Error(`${formatLabel} 已编码，但当前浏览器无法验证 Alpha`);
    }

    const decoded = await new CanvasSink(track, { alpha: true }).getCanvas(0);
    if (!decoded) throw new Error(`${formatLabel} 无法读取首帧`);
    const decodedContext = decoded.canvas.getContext("2d", {
      willReadFrequently: true,
    }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!decodedContext) throw new Error(`${formatLabel} 无法读取解码像素`);

    const transparentReferences = references.filter(
      (reference) => reference.alpha <= 16,
    );
    if (
      transparentReferences.length > 0 &&
      transparentReferences.every(
        ({ x, y }) => decodedContext.getImageData(x, y, 1, 1).data[3] > 48,
      )
    ) {
      throw new Error(`${formatLabel} 解码后的透明像素已变为不透明`);
    }

    const opaqueReferences = references.filter(
      (reference) => reference.alpha >= 240,
    );
    if (
      opaqueReferences.length > 0 &&
      opaqueReferences.every(
        ({ x, y }) => decodedContext.getImageData(x, y, 1, 1).data[3] < 207,
      )
    ) {
      throw new Error(`${formatLabel} 解码后的绘制像素缺少有效 Alpha`);
    }
  } finally {
    input.dispose();
  }
}

async function probeTransparentVideo(
  format: "webm" | "mp4",
): Promise<TransparentVideoSupport> {
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
    if (format === "webm") {
      const { canEncodeVideo } = await import("mediabunny");
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
    drawProbeFrame();
    const references = getAlphaReferences(canvas);
    const blob = await encodeCanvasVideo(
      canvas,
      100,
      10,
      drawProbeFrame,
      format === "webm"
        ? {
            format: "webm",
            codec: "vp9",
            alpha: "keep",
            mimeType: "video/webm",
            bitrate: 400_000,
          }
        : {
            format: "mp4",
            codec: "prores",
            alpha: "keep",
            mimeType: "video/mp4",
            fullCodecString: PRORES_4444_CODEC,
          },
    );
    await verifyTransparentVideoBlob(blob, format, references);

    return { supported: true };
  } catch (error) {
    const formatLabel = format === "webm" ? "WebM" : "MP4 ProRes 4444";
    return {
      supported: false,
      error:
        error instanceof Error
          ? `${formatLabel} Alpha 能力检测失败：${error.message}`
          : `${formatLabel} Alpha 能力检测失败`,
    };
  }
}

async function getTransparentWebMSupport() {
  transparentWebMSupportPromise ??= probeTransparentVideo("webm");
  return transparentWebMSupportPromise;
}

async function getTransparentMP4Support() {
  transparentMP4SupportPromise ??= probeTransparentVideo("mp4");
  return transparentMP4SupportPromise;
}

export async function supportsTransparentWebM() {
  return (await getTransparentWebMSupport()).supported;
}

export async function supportsTransparentMP4() {
  return (await getTransparentMP4Support()).supported;
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
    throw new Error("视频最长支持 60 秒");
  }

  options.onProgress?.(0);
  const transparent = getExportBackground(settings) === "transparent";
  if (transparent) {
    const support = await getTransparentWebMSupport();
    if (!support.supported) {
      throw new Error(support.error ?? "当前浏览器无法导出透明 WebM");
    }
  }

  const dimensions = getExportDimensions(project, settings);
  if (!transparent) {
    const { canEncodeVideo } = await import("mediabunny");
    if (
      !(await canEncodeVideo("vp9", {
        width: dimensions.width,
        height: dimensions.height,
        bitrate: 8_000_000,
      }))
    ) {
      throw new Error("当前浏览器没有可用的 VP9 编码器");
    }
  }
  const canvas = createExportCanvas(dimensions);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建视频导出画布");

  const blob = await encodeCanvasVideo(
    canvas,
    schedule.duration,
    settings.fps,
    (timeMs) => {
      renderProjectFrame(context, project, schedule, timeMs, settings);
    },
    {
      format: "webm",
      codec: "vp9",
      alpha: transparent ? "keep" : "discard",
      mimeType: "video/webm",
    },
    options.onProgress,
  );
  if (transparent) {
    renderProjectFrame(context, project, schedule, 0, settings);
    await verifyTransparentVideoBlob(blob, "webm", getAlphaReferences(canvas));
  }
  options.onProgress?.(1);
  return blob;
}

export async function exportTransparentMOV(
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

  options.onProgress?.(0);
  const response = await fetch("/api/export/prores", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project,
      settings: {
        ...settings,
        format: "mov",
        background: "transparent",
      },
    }),
  });
  if (!response.ok) {
    let message = "透明 MOV 导出失败";
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // Keep the localized fallback when the route did not return JSON.
    }
    throw new Error(message);
  }

  options.onProgress?.(0.95);
  const blob = await response.blob();
  if (!blob.size) throw new Error("透明 MOV 导出生成了空文件");
  options.onProgress?.(1);
  return blob;
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
  const transparent = getExportBackground(settings) === "transparent";
  if (transparent) {
    const support = await getTransparentMP4Support();
    if (!support.supported) {
      throw new Error(
        support.error ?? "当前浏览器无法导出 ProRes 4444 Alpha MP4",
      );
    }
  } else {
    const { canEncodeVideo } = await import("mediabunny");
    const canEncode = await canEncodeVideo("avc", {
      width: dimensions.width,
      height: dimensions.height,
      bitrate: 8_000_000,
    });
    if (!canEncode) {
      throw new Error("当前浏览器没有可用的 H.264/AVC 编码器");
    }
  }

  options.onProgress?.(0);
  const canvas = createExportCanvas(dimensions);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建视频导出画布");

  const blob = await encodeCanvasVideo(
    canvas,
    schedule.duration,
    settings.fps,
    (timeMs) => {
      renderProjectFrame(context, project, schedule, timeMs, settings);
    },
    transparent
      ? {
          format: "mp4",
          codec: "prores",
          alpha: "keep",
          mimeType: "video/mp4",
          fullCodecString: PRORES_4444_CODEC,
        }
      : {
          format: "mp4",
          codec: "avc",
          alpha: "discard",
          mimeType: "video/mp4",
          bitrate: 8_000_000,
        },
    options.onProgress,
  );
  if (transparent) {
    renderProjectFrame(context, project, schedule, 0, settings);
    await verifyTransparentVideoBlob(blob, "mp4", getAlphaReferences(canvas));
  }
  options.onProgress?.(1);
  return blob;
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
