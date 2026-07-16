import {
  type BrushSettings,
  createDefaultProject,
  DEFAULT_BRUSH,
  type ProjectIndexV1,
  type ProjectSummary,
  type ProjectV1,
  type StoredProjectV1,
} from "./types";

const LEGACY_STORAGE_KEY = "dranimo-project-v1";
const PROJECT_INDEX_KEY = "dranimo-project-index-v1";
const PROJECT_RECORD_PREFIX = "dranimo-project-record-v1:";
const DEFAULT_PROJECT_NAME = "untitled animation";
let runtimeStorage: Storage | null = null;

export interface ProjectLibrarySnapshot {
  projects: ProjectSummary[];
  activeProjectId: string;
  project: ProjectV1;
  error?: string;
}

export interface ProjectSelection {
  projects: ProjectSummary[];
  activeProjectId: string;
  project: ProjectV1;
}

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
  const brush = normalizeBrush(project.brush);
  return {
    ...project,
    // Existing stroke snapshots stay unchanged so saved artwork keeps its appearance.
    brush: {
      ...brush,
      color: brush.color === "#172b24" ? "#000000" : brush.color,
    },
    strokes: project.strokes.map((stroke) => ({
      ...stroke,
      brush: normalizeBrush(stroke.brush),
    })),
  };
}

function isProjectIndex(value: unknown): value is ProjectIndexV1 {
  if (!value || typeof value !== "object") return false;
  const index = value as Partial<ProjectIndexV1>;
  return (
    index.version === 1 &&
    typeof index.activeProjectId === "string" &&
    Array.isArray(index.projectIds) &&
    index.projectIds.every((id) => typeof id === "string")
  );
}

function isStoredProject(value: unknown): value is StoredProjectV1 {
  if (!value || typeof value !== "object") return false;
  const stored = value as Partial<StoredProjectV1>;
  return (
    stored.storageVersion === 1 &&
    typeof stored.id === "string" &&
    typeof stored.name === "string" &&
    typeof stored.createdAt === "number" &&
    typeof stored.updatedAt === "number" &&
    isProject(stored.project)
  );
}

function createRuntimeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function getStorage(storage?: Storage) {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    if (window.localStorage) return window.localStorage;
  } catch {
    // Fall back to a session-only store when browser storage is unavailable.
  }
  runtimeStorage ??= createRuntimeStorage();
  return runtimeStorage;
}

function requireStorage(storage?: Storage) {
  const resolved = getStorage(storage);
  if (!resolved) throw new Error("当前环境不支持本地项目存储");
  return resolved;
}

function projectRecordKey(id: string) {
  return `${PROJECT_RECORD_PREFIX}${id}`;
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toSummary(project: StoredProjectV1): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function sortProjects(projects: StoredProjectV1[]) {
  return [...projects].sort(
    (left, right) =>
      right.updatedAt - left.updatedAt || right.createdAt - left.createdAt,
  );
}

function writeStoredProject(storage: Storage, project: StoredProjectV1) {
  storage.setItem(projectRecordKey(project.id), JSON.stringify(project));
}

function writeIndex(
  storage: Storage,
  projects: StoredProjectV1[],
  activeProjectId: string,
) {
  const sorted = sortProjects(projects);
  const index: ProjectIndexV1 = {
    version: 1,
    activeProjectId,
    projectIds: sorted.map((project) => project.id),
  };
  storage.setItem(PROJECT_INDEX_KEY, JSON.stringify(index));
  return sorted;
}

function readStoredProject(storage: Storage, id: string) {
  const raw = storage.getItem(projectRecordKey(id));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredProject(parsed)) return null;
    return {
      ...parsed,
      project: normalizeProject(parsed.project),
    };
  } catch {
    return null;
  }
}

function scanStoredProjects(storage: Storage) {
  const projects: StoredProjectV1[] = [];
  let invalidRecords = 0;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(PROJECT_RECORD_PREFIX)) continue;
    const id = key.slice(PROJECT_RECORD_PREFIX.length);
    const project = readStoredProject(storage, id);
    if (project) projects.push(project);
    else invalidRecords += 1;
  }
  return { projects, invalidRecords };
}

function readIndex(storage: Storage) {
  const raw = storage.getItem(PROJECT_INDEX_KEY);
  if (!raw) return { index: null, invalid: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    return isProjectIndex(parsed)
      ? { index: parsed, invalid: false }
      : { index: null, invalid: true };
  } catch {
    return { index: null, invalid: true };
  }
}

function createStoredProject(name: string, project = createDefaultProject()) {
  const now = Date.now();
  return {
    storageVersion: 1,
    id: createId(),
    name,
    createdAt: now,
    updatedAt: now,
    project,
  } satisfies StoredProjectV1;
}

function readLegacyProject(storage: Storage) {
  const raw = storage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return { project: null, invalid: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    return isProject(parsed)
      ? { project: normalizeProject(parsed), invalid: false }
      : { project: null, invalid: true };
  } catch {
    return { project: null, invalid: true };
  }
}

function loadAllProjects(storage: Storage) {
  const { index, invalid: invalidIndex } = readIndex(storage);
  const scanned = scanStoredProjects(storage);
  const byId = new Map(
    scanned.projects.map((project) => [project.id, project]),
  );
  const missingIndexedRecords = index
    ? index.projectIds.filter((id) => !byId.has(id)).length
    : 0;
  const ordered = index
    ? index.projectIds.flatMap((id) => {
        const project = byId.get(id);
        if (!project) return [];
        byId.delete(id);
        return [project];
      })
    : [];
  ordered.push(...byId.values());
  return {
    projects: sortProjects(ordered),
    activeProjectId: index?.activeProjectId ?? "",
    invalidIndex,
    missingIndexedRecords,
    invalidRecords: scanned.invalidRecords,
  };
}

function getUniqueDefaultName(projects: ProjectSummary[]) {
  const names = new Set(projects.map((project) => project.name));
  if (!names.has(DEFAULT_PROJECT_NAME)) return DEFAULT_PROJECT_NAME;
  let suffix = 2;
  while (names.has(`${DEFAULT_PROJECT_NAME} ${suffix}`)) suffix += 1;
  return `${DEFAULT_PROJECT_NAME} ${suffix}`;
}

function getUniqueCopyName(projects: ProjectSummary[], name: string) {
  const names = new Set(projects.map((project) => project.name));
  const base = `${name} 副本`;
  if (!names.has(base)) return base;
  let suffix = 2;
  while (names.has(`${base} ${suffix}`)) suffix += 1;
  return `${base} ${suffix}`;
}

function cloneProject(project: ProjectV1): ProjectV1 {
  return JSON.parse(JSON.stringify(project)) as ProjectV1;
}

export function loadProjectLibrary(storage?: Storage): ProjectLibrarySnapshot {
  const resolved = getStorage(storage);
  if (!resolved) {
    const fallback = createStoredProject(DEFAULT_PROJECT_NAME);
    return {
      projects: [toSummary(fallback)],
      activeProjectId: fallback.id,
      project: fallback.project,
    };
  }

  const loaded = loadAllProjects(resolved);
  let projects = loaded.projects;
  let activeProjectId = loaded.activeProjectId;
  let legacyInvalid = false;

  if (!projects.length) {
    const legacy = readLegacyProject(resolved);
    legacyInvalid = legacy.invalid;
    const initial = createStoredProject(
      DEFAULT_PROJECT_NAME,
      legacy.project ?? createDefaultProject(),
    );
    writeStoredProject(resolved, initial);
    projects = writeIndex(resolved, [initial], initial.id);
    activeProjectId = initial.id;
    if (legacy.project) resolved.removeItem(LEGACY_STORAGE_KEY);
  }

  const active =
    projects.find((project) => project.id === activeProjectId) ?? projects[0];
  if (
    active.id !== activeProjectId ||
    loaded.invalidIndex ||
    loaded.missingIndexedRecords > 0
  ) {
    activeProjectId = active.id;
    projects = writeIndex(resolved, projects, activeProjectId);
  }

  const warnings = [];
  if (legacyInvalid) warnings.push("旧项目数据无法读取，已打开空白项目");
  if (loaded.invalidIndex || loaded.missingIndexedRecords > 0)
    warnings.push("项目索引已重建");
  if (loaded.invalidRecords)
    warnings.push(`已跳过 ${loaded.invalidRecords} 个损坏项目`);

  return {
    projects: projects.map(toSummary),
    activeProjectId,
    project: active.project,
    error: warnings.length ? warnings.join("；") : undefined,
  };
}

export function saveProject(
  projectId: string,
  project: ProjectV1,
  storage?: Storage,
) {
  const resolved = requireStorage(storage);
  const loaded = loadAllProjects(resolved);
  const current = loaded.projects.find((item) => item.id === projectId);
  if (!current) throw new Error("当前项目不存在，无法保存");
  const updated: StoredProjectV1 = {
    ...current,
    updatedAt: Date.now(),
    project,
  };
  writeStoredProject(resolved, updated);
  const projects = writeIndex(
    resolved,
    loaded.projects.map((item) => (item.id === projectId ? updated : item)),
    projectId,
  );
  return {
    projects: projects.map(toSummary),
    summary: toSummary(updated),
  };
}

export function createProject(storage?: Storage): ProjectSelection {
  const resolved = requireStorage(storage);
  const loaded = loadAllProjects(resolved);
  const created = createStoredProject(
    getUniqueDefaultName(loaded.projects.map(toSummary)),
  );
  writeStoredProject(resolved, created);
  const projects = writeIndex(
    resolved,
    [...loaded.projects, created],
    created.id,
  );
  return {
    projects: projects.map(toSummary),
    activeProjectId: created.id,
    project: created.project,
  };
}

export function loadProjectById(
  projectId: string,
  storage?: Storage,
): ProjectSelection {
  const resolved = requireStorage(storage);
  const loaded = loadAllProjects(resolved);
  const selected = loaded.projects.find((project) => project.id === projectId);
  if (!selected) throw new Error("无法打开所选项目");
  const projects = writeIndex(resolved, loaded.projects, selected.id);
  return {
    projects: projects.map(toSummary),
    activeProjectId: selected.id,
    project: selected.project,
  };
}

export function renameProject(
  projectId: string,
  name: string,
  storage?: Storage,
) {
  const nextName = name.trim().slice(0, 60);
  if (!nextName) throw new Error("项目名称不能为空");
  const resolved = requireStorage(storage);
  const loaded = loadAllProjects(resolved);
  const current = loaded.projects.find((project) => project.id === projectId);
  if (!current) throw new Error("无法重命名所选项目");
  const updated = { ...current, name: nextName, updatedAt: Date.now() };
  writeStoredProject(resolved, updated);
  return writeIndex(
    resolved,
    loaded.projects.map((project) =>
      project.id === projectId ? updated : project,
    ),
    loaded.activeProjectId || projectId,
  ).map(toSummary);
}

export function duplicateProject(
  projectId: string,
  storage?: Storage,
): ProjectSelection {
  const resolved = requireStorage(storage);
  const loaded = loadAllProjects(resolved);
  const source = loaded.projects.find((project) => project.id === projectId);
  if (!source) throw new Error("无法复制所选项目");
  const duplicate = createStoredProject(
    getUniqueCopyName(loaded.projects.map(toSummary), source.name),
    cloneProject(source.project),
  );
  writeStoredProject(resolved, duplicate);
  const projects = writeIndex(
    resolved,
    [...loaded.projects, duplicate],
    duplicate.id,
  );
  return {
    projects: projects.map(toSummary),
    activeProjectId: duplicate.id,
    project: duplicate.project,
  };
}

export function deleteProject(
  projectId: string,
  storage?: Storage,
): ProjectSelection {
  const resolved = requireStorage(storage);
  const loaded = loadAllProjects(resolved);
  if (!loaded.projects.some((project) => project.id === projectId)) {
    throw new Error("无法删除所选项目");
  }
  let remaining = loaded.projects.filter((project) => project.id !== projectId);
  if (!remaining.length) {
    const replacement = createStoredProject(DEFAULT_PROJECT_NAME);
    writeStoredProject(resolved, replacement);
    remaining = [replacement];
  }
  const activeProjectId =
    loaded.activeProjectId === projectId
      ? remaining[0].id
      : loaded.activeProjectId || remaining[0].id;
  const projects = writeIndex(resolved, remaining, activeProjectId);
  resolved.removeItem(projectRecordKey(projectId));
  const active = projects.find((project) => project.id === activeProjectId);
  if (!active) throw new Error("删除项目后无法打开剩余项目");
  return {
    projects: projects.map(toSummary),
    activeProjectId,
    project: active.project,
  };
}

export function emptyProject() {
  return createDefaultProject();
}
