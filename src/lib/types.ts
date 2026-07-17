export type AspectRatio = "square" | "landscape" | "portrait";
export type BackgroundMode = "solid" | "transparent";
export type PlaybackMode = "real" | "fixed" | "total";
export type Tool = "brush" | "eraser";
export type ExportFormat = "png" | "svg" | "webm" | "mov" | "mp4";
export type ExportCrop = "full" | "fit";

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
  t: number;
}

export interface BrushSettings {
  color: string;
  size: number;
  opacity: number;
  thinning: number;
  smoothing: number;
  streamline: number;
  simulatePressure: boolean;
  startTaper: number;
  endTaper: number;
  capStart: boolean;
  capEnd: boolean;
}

export interface StrokeRecord {
  id: string;
  points: StrokePoint[];
  brush: BrushSettings;
  createdAt: number;
}

export interface CanvasSettings {
  ratio: AspectRatio;
  width: number;
  height: number;
  /** Retained for v1 project compatibility; export settings control output transparency. */
  background: BackgroundMode;
  backgroundColor: string;
}

export interface PlaybackSettings {
  mode: PlaybackMode;
  strokeGap: number;
  fixedSpeed: number;
  totalDuration: number;
}

export interface ProjectV1 {
  version: 1;
  strokes: StrokeRecord[];
  canvas: CanvasSettings;
  playback: PlaybackSettings;
  brush: BrushSettings;
}

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface StoredProjectV1 extends ProjectSummary {
  storageVersion: 1;
  project: ProjectV1;
}

export interface ProjectIndexV1 {
  version: 1;
  activeProjectId: string;
  projectIds: string[];
}

export interface ExportSettings {
  format: ExportFormat;
  background?: BackgroundMode;
  crop: ExportCrop;
  scale: 1 | 2 | 3;
  padding: number;
  fps: number;
}

export interface StrokeSchedule {
  stroke: StrokeRecord;
  start: number;
  draw: number;
  end: number;
}

export interface PlaybackSchedule {
  items: StrokeSchedule[];
  duration: number;
  valid: boolean;
  warning?: string;
}

export const CANVAS_PRESETS: Record<
  AspectRatio,
  { width: number; height: number; label: string }
> = {
  square: { width: 1080, height: 1080, label: "1:1" },
  landscape: { width: 1920, height: 1080, label: "16:9" },
  portrait: { width: 1080, height: 1920, label: "9:16" },
};

export const DEFAULT_BRUSH: BrushSettings = {
  color: "#000000",
  size: 15,
  opacity: 1,
  thinning: 0,
  smoothing: 0.61,
  streamline: 0.5,
  simulatePressure: false,
  startTaper: 0,
  endTaper: 0,
  capStart: true,
  capEnd: true,
};

export const DEFAULT_CANVAS: CanvasSettings = {
  ratio: "square",
  width: 1080,
  height: 1080,
  background: "solid",
  backgroundColor: "#ffffff",
};

export const DEFAULT_PLAYBACK: PlaybackSettings = {
  mode: "fixed",
  strokeGap: 120,
  fixedSpeed: 600,
  totalDuration: 5_000,
};

export function createDefaultProject(): ProjectV1 {
  return {
    version: 1,
    strokes: [],
    canvas: { ...DEFAULT_CANVAS },
    playback: { ...DEFAULT_PLAYBACK },
    brush: { ...DEFAULT_BRUSH },
  };
}
