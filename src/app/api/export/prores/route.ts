import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Writable } from "node:stream";
import sharp from "sharp";
import { getExportDimensions, projectToSvg } from "@/lib/export";
import { buildPlaybackSchedule } from "@/lib/playback";
import type { ExportSettings, ProjectV1 } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_VIDEO_DURATION_MS = 60_000;
const MAX_OUTPUT_BYTES = 2_000_000_000;
// Sharp rasterizes these SVG frames to 8-bit RGBA, so 16-bit alpha adds no precision.
const PRORES_ALPHA_BITS = 8;

type ProResRequest = {
  project?: ProjectV1;
  settings?: Partial<ExportSettings>;
};

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function normalizeSettings(
  input: Partial<ExportSettings> = {},
): ExportSettings {
  const scale =
    input.scale === 1 || input.scale === 2 || input.scale === 3
      ? input.scale
      : 2;
  const fps = input.fps === 24 || input.fps === 60 ? input.fps : 30;
  const rawPadding = input.padding;
  const padding =
    typeof rawPadding === "number" &&
    Number.isFinite(rawPadding) &&
    rawPadding >= 0
      ? Math.min(160, rawPadding)
      : 32;
  return {
    format: "mov",
    background: "transparent",
    crop: input.crop === "fit" ? "fit" : "full",
    scale,
    padding,
    fps,
  };
}

function ffmpegExecutable() {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

function writeChunk(stream: Writable, chunk: Buffer) {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      stream.off("error", onError);
      reject(error);
    };
    stream.once("error", onError);
    stream.write(chunk, () => {
      stream.off("error", onError);
      resolve();
    });
  });
}

async function encodeProRes(
  frames: AsyncGenerator<Buffer, void, void>,
  fps: number,
) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "dranimo-prores-"));
  const outputPath = join(temporaryDirectory, "animation.mov");
  const ffmpeg = spawn(
    ffmpegExecutable(),
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "image2pipe",
      "-vcodec",
      "png",
      "-framerate",
      String(fps),
      "-i",
      "pipe:0",
      "-an",
      "-c:v",
      "prores_ks",
      "-profile:v",
      "4",
      "-alpha_bits",
      String(PRORES_ALPHA_BITS),
      "-pix_fmt",
      "yuva444p10le",
      "-f",
      "mov",
      outputPath,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  const errors: Buffer[] = [];
  let processError: Error | null = null;
  ffmpeg.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
  ffmpeg.once("error", (error) => {
    processError = error;
  });

  try {
    for await (const frame of frames) {
      await writeChunk(ffmpeg.stdin, frame);
    }
    ffmpeg.stdin.end();
    const [code] = (await once(ffmpeg, "close")) as [number | null];
    if (processError) throw processError;
    if (code !== 0) {
      throw new Error(
        `ProRes 转码失败：${Buffer.concat(errors).toString("utf8").trim()}`,
      );
    }
    const output = await readFile(outputPath);
    if (!output.length) throw new Error("ProRes 转码生成了空文件");
    if (output.length > MAX_OUTPUT_BYTES) {
      throw new Error("ProRes 文件过大，请降低导出倍率或动画时长");
    }
    return output;
  } catch (error) {
    ffmpeg.kill("SIGKILL");
    throw error;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function verifyAlpha(buffer: Buffer, frameCount: number) {
  const middleFrame = Math.max(1, Math.floor(frameCount / 2));
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "dranimo-alpha-"));
  const inputPath = join(temporaryDirectory, "animation.mov");
  await writeFile(inputPath, buffer);
  const ffmpeg = spawn(
    ffmpegExecutable(),
    [
      "-hide_banner",
      "-loglevel",
      "info",
      "-i",
      inputPath,
      "-vf",
      `select='eq(n,0)+eq(n,${middleFrame})',alphaextract,format=gray,signalstats,metadata=print`,
      "-f",
      "null",
      "-",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const logs: Buffer[] = [];
  let processError: Error | null = null;
  ffmpeg.stdout.on("data", (chunk: Buffer) => logs.push(chunk));
  ffmpeg.stderr.on("data", (chunk: Buffer) => logs.push(chunk));
  ffmpeg.once("error", (error) => {
    processError = error;
  });

  try {
    const [code] = (await once(ffmpeg, "close")) as [number | null];
    if (processError) throw processError;
    if (code !== 0) {
      throw new Error(
        `无法验证 ProRes Alpha 通道：${Buffer.concat(logs).toString("utf8").trim()}`,
      );
    }
  } catch (error) {
    ffmpeg.kill("SIGKILL");
    throw error;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  const output = Buffer.concat(logs).toString("utf8");
  const minima = [...output.matchAll(/YMIN=([\d.]+)/g)].map((match) =>
    Number(match[1]),
  );
  const maxima = [...output.matchAll(/YMAX=([\d.]+)/g)].map((match) =>
    Number(match[1]),
  );
  if (
    !minima.some((value) => value <= 1) ||
    !maxima.some((value) => value >= 254)
  ) {
    throw new Error("ProRes 输出没有通过透明像素验证");
  }
}

export async function POST(request: Request) {
  let body: ProResRequest;
  try {
    body = (await request.json()) as ProResRequest;
  } catch {
    return jsonError("透明 MOV 请求数据无效", 400);
  }

  const projectInput = body.project;
  if (
    !projectInput ||
    projectInput.version !== 1 ||
    !projectInput.canvas ||
    !projectInput.playback ||
    !Array.isArray(projectInput.strokes) ||
    projectInput.strokes.length === 0
  ) {
    return jsonError("透明 MOV 缺少有效动画项目", 400);
  }
  const project = projectInput;

  const settings = normalizeSettings(body.settings);
  const schedule = buildPlaybackSchedule(project.strokes, project.playback);
  if (!schedule.valid) {
    return jsonError(schedule.warning ?? "动画时长设置无效", 422);
  }
  if (schedule.duration <= 0) return jsonError("动画没有可导出的内容", 422);
  if (schedule.duration > MAX_VIDEO_DURATION_MS) {
    return jsonError("视频最长支持 60 秒", 422);
  }

  try {
    const dimensions = getExportDimensions(project, settings);
    const frameCount = Math.max(
      1,
      Math.ceil(
        Math.max(schedule.duration / 1000, 1 / settings.fps) * settings.fps,
      ),
    );

    async function* frames() {
      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        const timestamp = frameIndex / settings.fps;
        const timeMs =
          frameIndex === frameCount - 1
            ? schedule.duration
            : Math.min(schedule.duration, timestamp * 1000);
        const svg = projectToSvg(project, schedule, timeMs, settings);
        yield sharp(Buffer.from(svg)).png().toBuffer();
      }
    }

    const buffer = await encodeProRes(frames(), settings.fps);
    await verifyAlpha(buffer, frameCount);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "video/quicktime",
        "Content-Disposition": 'attachment; filename="dranimo-animation.mov"',
        "X-Export-Width": String(dimensions.width),
        "X-Export-Height": String(dimensions.height),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "透明 MOV 导出失败";
    if (message.includes("ENOENT") || message.includes("spawn ffmpeg")) {
      return jsonError("找不到 ffmpeg，请安装 ffmpeg 或设置 FFMPEG_PATH", 503);
    }
    return jsonError(message, 500);
  }
}
