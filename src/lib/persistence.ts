import {
  type BrushSettings,
  createDefaultProject,
  DEFAULT_BRUSH,
  type ProjectV1,
} from "./types";

const STORAGE_KEY = "dranimo-project-v1";

function isProject(value: unknown): value is ProjectV1 {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<ProjectV1>;
  return (
    project.version === 1 &&
    Array.isArray(project.strokes) &&
    Boolean(project.canvas) &&
    Boolean(project.playback) &&
    Boolean(project.brush)
  );
}

function normalizeBrush(
  value: Partial<BrushSettings> & { mode?: unknown },
): BrushSettings {
  const { mode: _legacyMode, ...brush } = value;
  return {
    ...DEFAULT_BRUSH,
    ...brush,
  };
}

function normalizeProject(project: ProjectV1): ProjectV1 {
  return {
    ...project,
    brush: normalizeBrush(project.brush),
    strokes: project.strokes.map((stroke) => ({
      ...stroke,
      brush: normalizeBrush(stroke.brush),
    })),
  };
}

export async function loadProject(): Promise<{
  project: ProjectV1 | null;
  error?: string;
}> {
  if (typeof window === "undefined") return { project: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { project: null };
    const parsed: unknown = JSON.parse(raw);
    if (!isProject(parsed))
      return { project: null, error: "项目数据版本不兼容，已打开空白画布" };
    return { project: normalizeProject(parsed) };
  } catch {
    return { project: null, error: "项目数据读取失败，已打开空白画布" };
  }
}

export async function saveProject(project: ProjectV1) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}

export function emptyProject() {
  return createDefaultProject();
}
