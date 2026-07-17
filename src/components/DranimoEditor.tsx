"use client";

import {
  CircleHelp,
  Download,
  Eraser,
  Expand,
  Eye,
  Pause,
  Pencil,
  Play,
  Redo2,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  Undo2,
  Volume2,
  X,
} from "lucide-react";
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import ProjectSwitcher from "@/components/ProjectSwitcher";
import { SettingsPanelContent } from "@/components/SettingsPanelContent";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  eraserTrailPath,
  pruneTrailPoints,
  type TrailPoint,
} from "@/lib/eraser-trail";
import {
  canvasToPng,
  createExportCanvas,
  downloadBlob,
  exportMP4,
  exportTransparentMOV,
  exportWebM,
  getExportBackground,
  getExportDimensions,
  projectToSvg,
  renderProjectFrame,
} from "@/lib/export";
import {
  createProject as createStoredProject,
  deleteProject as deleteStoredProject,
  duplicateProject as duplicateStoredProject,
  loadProjectById,
  loadProjectLibrary,
  renameProject as renameStoredProject,
  saveProject,
} from "@/lib/persistence";
import { buildPlaybackSchedule, getVisibleStrokes } from "@/lib/playback";
import { pointHitsStroke, strokePath } from "@/lib/stroke-geometry";
import {
  type BrushSettings,
  CANVAS_PRESETS,
  createDefaultProject,
  type ExportSettings,
  type ProjectSummary,
  type ProjectV1,
  type StrokePoint,
  type StrokeRecord,
  type Tool,
} from "@/lib/types";
import { cn } from "@/lib/utils";

function appendDistinctPoints(current: StrokePoint[], samples: StrokePoint[]) {
  let next = current;
  for (const sample of samples) {
    const previous = next[next.length - 1];
    if (
      previous &&
      Math.hypot(previous.x - sample.x, previous.y - sample.y) < 0.5
    ) {
      continue;
    }
    if (next === current) next = [...current];
    next.push(sample);
  }
  return next;
}

function exportFileBaseName(name: string) {
  const cleaned = name
    .trim()
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return cleaned || "dranimo-animation";
}

function IconButton({
  label,
  active,
  disabled,
  className,
  controls,
  expanded,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  controls?: string;
  expanded?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const icon = isValidElement<{
    size?: number;
    "data-icon"?: string;
  }>(children)
    ? cloneElement(children, {
        "data-icon": "inline-start",
        size: undefined,
      })
    : children;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "size-[34px] rounded-[9px] text-muted-foreground",
              active && "bg-accent text-foreground",
              className,
            )}
            aria-label={label}
            aria-controls={controls}
            aria-expanded={expanded}
            disabled={disabled}
            onClick={onClick}
          />
        }
      >
        {icon}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function PanelFooter() {
  return (
    <div className="flex min-h-[43px] items-center gap-[7px] border-t border-border px-[18px] text-[10px] text-muted-foreground [&_svg]:size-4">
      <Volume2 />
      <span>本地优先 · 自动保存</span>
      <span className="flex-1" />
      <Settings2 />
    </div>
  );
}

export default function DranimoEditor() {
  const [project, setProject] = useState<ProjectV1>(createDefaultProject);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [undo, setUndo] = useState<StrokeRecord[][]>([]);
  const [redo, setRedo] = useState<StrokeRecord[][]>([]);
  const [tool, setTool] = useState<Tool>("brush");
  const [drawing, setDrawing] = useState<StrokePoint[]>([]);
  const [eraserTrail, setEraserTrail] = useState("");
  const [eraserHits, setEraserHits] = useState<Set<string>>(() => new Set());
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [showPlaybackFrame, setShowPlaybackFrame] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackError, setPlaybackError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [projectReady, setProjectReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    format: "png",
    background: "solid",
    crop: "full",
    scale: 2,
    padding: 32,
    fps: 30,
  });
  const [stageSize, setStageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<StrokePoint[]>([]);
  const eraserTrailRef = useRef<TrailPoint[]>([]);
  const eraserTrailSizeRef = useRef(12);
  const eraserHitsRef = useRef<Set<string>>(new Set());
  const eraserFrameRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const animationRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const playbackTimeRef = useRef(0);
  const autosaveTimerRef = useRef<number | null>(null);
  const wasLoaded = useRef(false);

  const schedule = useMemo(
    () => buildPlaybackSchedule(project.strokes, project.playback),
    [project.strokes, project.playback],
  );
  const dimensions = useMemo(
    () => getExportDimensions(project, exportSettings),
    [project, exportSettings],
  );
  const transparentExport =
    getExportBackground(exportSettings) === "transparent";
  const canvasDisplaySize = useMemo(() => {
    if (!stageSize) return null;
    const availableWidth = Math.max(1, stageSize.width);
    const availableHeight = Math.max(1, stageSize.height);
    const scale = Math.min(
      availableWidth / project.canvas.width,
      availableHeight / project.canvas.height,
      900 / project.canvas.width,
      900 / project.canvas.height,
    );
    return {
      width: Math.max(1, Math.floor(project.canvas.width * scale)),
      height: Math.max(1, Math.floor(project.canvas.height * scale)),
    };
  }, [project.canvas.height, project.canvas.width, stageSize]);
  const visibleStrokes = useMemo(
    () =>
      showPlaybackFrame && schedule.valid
        ? getVisibleStrokes(schedule, currentTime)
        : project.strokes.map((stroke) => ({
            stroke,
            points: stroke.points,
          })),
    [currentTime, project.strokes, schedule, showPlaybackFrame],
  );
  const visiblePaths = useMemo(
    () =>
      visibleStrokes.map(({ stroke, points }) => ({
        id: stroke.id,
        color: stroke.brush.color,
        opacity: stroke.brush.opacity,
        // 局部回放仍在采样时不要把末端当成完成笔画，否则圆帽会先于轮廓出现。
        path: strokePath(
          stroke,
          points,
          !showPlaybackFrame || points.length >= stroke.points.length,
        ),
      })),
    [showPlaybackFrame, visibleStrokes],
  );
  const drawingPath = useMemo(() => {
    if (!drawing.length || tool !== "brush") return "";
    const preview: StrokeRecord = {
      id: "preview",
      points: drawing,
      brush: project.brush,
      createdAt: 0,
    };
    // 绘制中让 perfect-freehand 继续平滑末端，避免完成态圆帽显示成孤立圆点。
    return strokePath(preview, drawing, false);
  }, [drawing, project.brush, tool]);

  const persistProject = useCallback((projectId: string, next: ProjectV1) => {
    try {
      const result = saveProject(projectId, next);
      setProjects(result.projects);
      setSavedAt(Date.now());
      setSaveFailed(false);
      return true;
    } catch (error) {
      setSaveFailed(true);
      setLoadError(error instanceof Error ? error.message : "项目保存失败");
      return false;
    }
  }, []);

  const clearEraserState = useCallback(() => {
    if (eraserFrameRef.current !== null) {
      cancelAnimationFrame(eraserFrameRef.current);
      eraserFrameRef.current = null;
    }
    eraserTrailRef.current = [];
    eraserHitsRef.current = new Set();
    setEraserTrail("");
    setEraserHits(new Set());
  }, []);

  useLayoutEffect(() => {
    const {
      project: stored,
      projects: storedProjects,
      activeProjectId: storedActiveProjectId,
      error,
    } = loadProjectLibrary();
    setProject(stored);
    setProjects(storedProjects);
    setActiveProjectId(storedActiveProjectId);
    if (error) setLoadError(error);
    wasLoaded.current = true;
    setProjectReady(true);
  }, []);

  useEffect(() => {
    if (!wasLoaded.current || !activeProjectId) return;
    const timer = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      persistProject(activeProjectId, project);
    }, 300);
    autosaveTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (autosaveTimerRef.current === timer) autosaveTimerRef.current = null;
    };
  }, [activeProjectId, persistProject, project]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measureStage = () => {
      const style = window.getComputedStyle(stage);
      const horizontalPadding =
        Number.parseFloat(style.paddingLeft) +
        Number.parseFloat(style.paddingRight);
      const verticalPadding =
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom);
      const next = {
        width: Math.max(1, stage.clientWidth - horizontalPadding),
        height: Math.max(1, stage.clientHeight - verticalPadding),
      };
      setStageSize((current) =>
        current &&
        current.width === next.width &&
        current.height === next.height
          ? current
          : next,
      );
    };
    measureStage();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureStage);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    playbackTimeRef.current = currentTime;
  }, [currentTime]);

  // Leaving the eraser mid-sweep should drop the trail and un-dim everything.
  useEffect(() => {
    if (tool !== "eraser") clearEraserState();
  }, [clearEraserState, tool]);

  useEffect(() => clearEraserState, [clearEraserState]);

  useEffect(() => {
    if (!settingsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [settingsOpen]);

  useEffect(() => {
    // 每帧更新 currentTime 不能重启这个 effect，否则 RAF 的计时基准会不断回退。
    if (!isPreviewing) return;
    if (!schedule.valid) {
      setPlaybackError(schedule.warning ?? "无法播放当前动画");
      setIsPreviewing(false);
      return;
    }
    startRef.current = performance.now() - playbackTimeRef.current;
    const tick = (now: number) => {
      const next = Math.max(
        playbackTimeRef.current,
        Math.min(schedule.duration, now - startRef.current),
      );
      playbackTimeRef.current = next;
      setCurrentTime(next);
      if (next >= schedule.duration) {
        setIsPreviewing(false);
        return;
      }
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPreviewing, schedule]);

  const resetTransientState = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    activePointerIdRef.current = null;
    drawingRef.current = [];
    playbackTimeRef.current = 0;
    clearEraserState();
    setDrawing([]);
    setUndo([]);
    setRedo([]);
    setCurrentTime(0);
    setIsPreviewing(false);
    setShowPlaybackFrame(false);
    setPlaybackError("");
    setExportOpen(false);
    setExportError("");
    setSettingsOpen(false);
  };

  const flushCurrentProject = () => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (!activeProjectId) return true;
    return persistProject(activeProjectId, project);
  };

  const applyProjectSelection = (
    selection: ReturnType<typeof createStoredProject>,
  ) => {
    setProject(selection.project);
    setProjects(selection.projects);
    setActiveProjectId(selection.activeProjectId);
    setSavedAt(Date.now());
    setSaveFailed(false);
    resetTransientState();
  };

  const handleCreateProject = () => {
    if (!flushCurrentProject()) return false;
    try {
      applyProjectSelection(createStoredProject());
      return true;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "新建项目失败");
      return false;
    }
  };

  const handleSelectProject = (projectId: string) => {
    if (projectId === activeProjectId) return true;
    if (!flushCurrentProject()) return false;
    try {
      applyProjectSelection(loadProjectById(projectId));
      return true;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "打开项目失败");
      return false;
    }
  };

  const handleRenameProject = (projectId: string, name: string) => {
    if (!flushCurrentProject()) return false;
    try {
      setProjects(renameStoredProject(projectId, name));
      setSavedAt(Date.now());
      return true;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "重命名项目失败");
      return false;
    }
  };

  const handleDuplicateProject = (projectId: string) => {
    if (!flushCurrentProject()) return false;
    try {
      applyProjectSelection(duplicateStoredProject(projectId));
      return true;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "复制项目失败");
      return false;
    }
  };

  const handleDeleteProject = (projectId: string) => {
    if (!flushCurrentProject()) return false;
    try {
      const selection = deleteStoredProject(projectId);
      if (projectId === activeProjectId) {
        applyProjectSelection(selection);
      } else {
        setProjects(selection.projects);
        setSaveFailed(false);
      }
      return true;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "删除项目失败");
      return false;
    }
  };

  const commitStrokes = (next: StrokeRecord[]) => {
    setUndo((items) => [...items, project.strokes]);
    setRedo([]);
    const nextProject = { ...project, strokes: next };
    setProject(nextProject);
    if (activeProjectId) persistProject(activeProjectId, nextProject);
    setCurrentTime(0);
    setIsPreviewing(false);
    setShowPlaybackFrame(false);
  };

  const updateBrush = (patch: Partial<BrushSettings>) =>
    setProject((current) => ({
      ...current,
      brush: { ...current.brush, ...patch },
    }));

  const pointsFromEvent = (
    event: React.PointerEvent<SVGSVGElement>,
    fallbackPressure = 0.5,
  ): StrokePoint[] => {
    const svg = event.currentTarget;
    const rect = event.currentTarget.getBoundingClientRect();
    const screenToViewBox =
      typeof svg.getScreenCTM === "function"
        ? svg.getScreenCTM()?.inverse()
        : null;
    const svgPoint =
      screenToViewBox && typeof svg.createSVGPoint === "function"
        ? svg.createSVGPoint()
        : null;
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const samples = coalesced.length ? coalesced : [event.nativeEvent];
    return samples.map((sample) => {
      // pointerup 常把 pressure 重置为 0；沿用上一点，避免末端宽度突变成圆点。
      const pressure = sample.pressure > 0 ? sample.pressure : fallbackPressure;
      if (screenToViewBox && svgPoint) {
        svgPoint.x = sample.clientX;
        svgPoint.y = sample.clientY;
        const point = svgPoint.matrixTransform(screenToViewBox);
        return {
          x: point.x,
          y: point.y,
          pressure,
          t: sample.timeStamp,
        };
      }
      return {
        x: ((sample.clientX - rect.left) / rect.width) * project.canvas.width,
        y: ((sample.clientY - rect.top) / rect.height) * project.canvas.height,
        pressure,
        t: sample.timeStamp,
      };
    });
  };

  // RAF loop that ages the eraser trail out; it re-renders the shrinking comet
  // every frame and stops once every point has faded past the trail window.
  const renderEraserFrame = useCallback(() => {
    const now = performance.now();
    const pruned = pruneTrailPoints(eraserTrailRef.current, now);
    eraserTrailRef.current = pruned;
    setEraserTrail(
      pruned.length >= 2
        ? eraserTrailPath(pruned, now, { size: eraserTrailSizeRef.current })
        : "",
    );
    eraserFrameRef.current =
      pruned.length >= 2 ? requestAnimationFrame(renderEraserFrame) : null;
  }, []);

  const ensureEraserFrame = useCallback(() => {
    if (eraserFrameRef.current === null) {
      eraserFrameRef.current = requestAnimationFrame(renderEraserFrame);
    }
  }, [renderEraserFrame]);

  const pushEraserTrail = (points: StrokePoint[]) => {
    const now = performance.now();
    const additions = points.map(({ x, y }) => ({ x, y, t: now }));
    eraserTrailRef.current = pruneTrailPoints(
      [...eraserTrailRef.current, ...additions],
      now,
    );
    ensureEraserFrame();
  };

  // Excalidraw-style eraser: mark whatever the pointer sweeps over as pending
  // deletion (dimmed on canvas) and only commit the removal on pointer up.
  const accumulateEraserHits = (points: StrokePoint[]) => {
    const hits = eraserHitsRef.current;
    const tolerance = project.brush.size * 0.65;
    let changed = false;
    for (const stroke of project.strokes) {
      if (hits.has(stroke.id)) continue;
      if (points.some((point) => pointHitsStroke(point, stroke, tolerance))) {
        hits.add(stroke.id);
        changed = true;
      }
    }
    if (changed) setEraserHits(new Set(hits));
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerIdRef.current = event.pointerId;
    setIsPreviewing(false);
    setShowPlaybackFrame(false);
    const points = pointsFromEvent(event);
    drawingRef.current = points;
    setDrawing(points);
    if (tool === "eraser") {
      eraserTrailSizeRef.current = Math.max(8, project.brush.size * 0.8);
      pushEraserTrail(points);
      accumulateEraserHits(points);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    const previousLength = drawingRef.current.length;
    const points = appendDistinctPoints(
      drawingRef.current,
      pointsFromEvent(
        event,
        drawingRef.current[drawingRef.current.length - 1]?.pressure ?? 0.5,
      ),
    );
    if (points === drawingRef.current) return;
    drawingRef.current = points;
    setDrawing(points);
    if (tool === "eraser") {
      pushEraserTrail(points.slice(previousLength));
      accumulateEraserHits(points);
    }
  };

  const finishDrawing = (event: React.PointerEvent<SVGSVGElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    activePointerIdRef.current = null;
    const points = appendDistinctPoints(
      drawingRef.current,
      pointsFromEvent(
        event,
        drawingRef.current[drawingRef.current.length - 1]?.pressure ?? 0.5,
      ),
    );
    drawingRef.current = [];
    setDrawing([]);
    if (tool === "eraser") {
      // Fold in the final samples, then delete everything the sweep marked.
      accumulateEraserHits(points);
      const hits = eraserHitsRef.current;
      const next = project.strokes.filter((stroke) => !hits.has(stroke.id));
      clearEraserState();
      if (next.length !== project.strokes.length) commitStrokes(next);
      return;
    }
    if (points.length === 0) return;
    const normalized = points.map((point, index) => ({
      ...point,
      t: index === 0 ? 0 : point.t - points[0].t,
    }));
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    commitStrokes([
      ...project.strokes,
      {
        id,
        points: normalized,
        brush: { ...project.brush },
        createdAt: Date.now(),
      },
    ]);
  };

  const undoStroke = () => {
    const previous = undo[undo.length - 1];
    if (!previous) return;
    setRedo((items) => [...items, project.strokes]);
    setUndo((items) => items.slice(0, -1));
    setProject((current) => ({ ...current, strokes: previous }));
  };

  const redoStroke = () => {
    const next = redo[redo.length - 1];
    if (!next) return;
    setUndo((items) => [...items, project.strokes]);
    setRedo((items) => items.slice(0, -1));
    setProject((current) => ({ ...current, strokes: next }));
  };

  const changeRatio = (ratio: keyof typeof CANVAS_PRESETS) =>
    setProject((current) => ({
      ...current,
      canvas: {
        ...current.canvas,
        ratio,
        width: CANVAS_PRESETS[ratio].width,
        height: CANVAS_PRESETS[ratio].height,
      },
    }));

  const startPlayback = () => {
    if (!schedule.valid) {
      setPlaybackError(schedule.warning ?? "总时长设置无效");
      return;
    }
    if (!schedule.duration) return;
    setCurrentTime((time) => (time >= schedule.duration ? 0 : time));
    setShowPlaybackFrame(true);
    setIsPreviewing(true);
    setPlaybackError("");
  };

  const handleExport = async () => {
    if (!project.strokes.length || exporting) return;
    setExporting(true);
    setExportError("");
    setExportProgress(
      exportSettings.format === "webm" ||
        exportSettings.format === "mov" ||
        exportSettings.format === "mp4"
        ? 0
        : null,
    );
    setPlaybackError("");
    const fileBaseName = exportFileBaseName(
      projects.find((item) => item.id === activeProjectId)?.name ?? "",
    );
    try {
      if (exportSettings.format === "svg") {
        const svg = projectToSvg(
          project,
          schedule,
          schedule.duration,
          exportSettings,
        );
        downloadBlob(
          new Blob([svg], { type: "image/svg+xml" }),
          `${fileBaseName}.svg`,
        );
      } else if (
        exportSettings.format === "webm" ||
        exportSettings.format === "mov" ||
        exportSettings.format === "mp4"
      ) {
        const exportVideo =
          exportSettings.format === "webm"
            ? exportWebM
            : exportSettings.format === "mov"
              ? exportTransparentMOV
              : exportMP4;
        const blob = await exportVideo(project, schedule, exportSettings, {
          onProgress: (progress) =>
            setExportProgress(Math.round(progress * 100)),
        });
        downloadBlob(blob, `${fileBaseName}.${exportSettings.format}`);
      } else {
        const canvas = createExportCanvas(dimensions);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("无法创建导出画布");
        renderProjectFrame(
          context,
          project,
          schedule,
          schedule.duration,
          exportSettings,
        );
        downloadBlob(await canvasToPng(canvas), `${fileBaseName}.png`);
      }
      setExportOpen(false);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "导出失败");
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  };

  const ratioLabel = CANVAS_PRESETS[project.canvas.ratio].label;
  return (
    <main className="flex h-screen min-h-screen flex-col overflow-hidden bg-background">
      <header className="z-[3] flex h-16 flex-none items-center border-b border-border bg-[color-mix(in_oklab,var(--card)_88%,transparent)] px-[22px] backdrop-blur-lg max-[640px]:px-3">
        <div className="flex min-w-[240px] items-center gap-[9px] text-[18px] font-bold tracking-[-0.04em] max-[980px]:min-w-[170px] max-[640px]:min-w-0">
          <div className="grid size-7 -rotate-[7deg] place-items-center rounded-[9px] bg-accent text-foreground">
            <Sparkles size={16} />
          </div>
          <span>dranimo</span>
          <span className="rounded-[5px] border border-input px-1.5 py-[3px] text-[9px] font-bold tracking-[0.08em] text-muted-foreground">
            MVP
          </span>
        </div>
        <ProjectSwitcher
          projects={projects}
          activeProjectId={activeProjectId}
          savedState={saveFailed ? "未保存" : savedAt ? "已保存" : "本地项目"}
          disabled={!projectReady || exporting}
          onCreate={handleCreateProject}
          onSelect={handleSelectProject}
          onRename={handleRenameProject}
          onDuplicate={handleDuplicateProject}
          onDelete={handleDeleteProject}
        />
        <div className="flex min-w-[240px] items-center justify-end gap-[7px] max-[640px]:min-w-0">
          <IconButton
            label="帮助"
            className="max-[640px]:hidden"
            onClick={() => toast("在画布上拖动即可绘制，橡皮擦会整笔删除")}
          >
            <CircleHelp size={18} />
          </IconButton>
          <IconButton
            label={settingsOpen ? "关闭设置" : "打开设置"}
            className="hidden max-[980px]:flex"
            controls="editor-settings-mobile"
            expanded={settingsOpen}
            active={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <Settings2 size={18} />
          </IconButton>
          <Button
            type="button"
            variant="default"
            className="h-[35px] rounded-[9px] px-3.5 text-xs font-bold max-[640px]:px-2.5"
            onClick={() => setExportOpen(true)}
            disabled={!project.strokes.length}
          >
            <Download data-icon="inline-start" />
            导出
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[60px_minmax(0,1fr)_310px] max-[980px]:grid-cols-[55px_minmax(0,1fr)] max-[640px]:grid-cols-[50px_minmax(0,1fr)]">
        <aside className="flex flex-col items-center gap-[9px] border-r border-border bg-sidebar py-4">
          <div className="flex flex-col gap-[5px]">
            <IconButton
              label="画笔"
              active={tool === "brush"}
              onClick={() => setTool("brush")}
            >
              <Pencil size={19} />
            </IconButton>
            <IconButton
              label="整笔橡皮擦"
              active={tool === "eraser"}
              onClick={() => setTool("eraser")}
            >
              <Eraser size={19} />
            </IconButton>
          </div>
          <Separator className="my-[5px] w-7" />
          <div className="flex flex-col gap-[5px]">
            <IconButton
              label="撤销"
              disabled={!undo.length}
              onClick={undoStroke}
            >
              <Undo2 size={18} />
            </IconButton>
            <IconButton
              label="重做"
              disabled={!redo.length}
              onClick={redoStroke}
            >
              <Redo2 size={18} />
            </IconButton>
          </div>
          <div className="mt-auto">
            <IconButton
              label="清空画布"
              disabled={!project.strokes.length}
              onClick={() => commitStrokes([])}
            >
              <Trash2 size={18} />
            </IconButton>
          </div>
        </aside>

        <section className="relative flex min-h-0 min-w-0 flex-col bg-muted">
          <div className="flex h-12 items-center justify-between border-b border-[color-mix(in_oklab,var(--border)_75%,transparent)] px-5 text-[11px] text-muted-foreground max-[640px]:px-3">
            <div className="flex items-center gap-2 font-bold text-foreground">
              <span
                className="size-[9px] rounded-full shadow-[0_0_0_3px_color-mix(in_oklab,var(--foreground)_8%,transparent)]"
                style={{
                  background:
                    tool === "eraser"
                      ? "var(--destructive)"
                      : project.brush.color,
                }}
              />
              <span>{tool === "eraser" ? "整笔橡皮擦" : "画笔"}</span>
              <span className="font-normal text-muted-foreground">
                {tool === "eraser" ? "拖动删除整笔" : `${project.brush.size}px`}
              </span>
            </div>
            <div className="flex items-center gap-3.5">
              <span className="max-[640px]:hidden">{ratioLabel}</span>
              <span className="border-l border-input pl-3.5">
                {project.canvas.width} × {project.canvas.height}
              </span>
            </div>
          </div>
          <div
            className="grid min-h-0 flex-1 place-items-center overflow-hidden p-5 max-[640px]:p-2.5"
            ref={stageRef}
          >
            {projectReady && canvasDisplaySize && (
              <div
                className="relative max-h-full max-w-full overflow-hidden rounded-[3px] bg-card shadow-[var(--shadow),0_0_0_1px_color-mix(in_oklab,var(--foreground)_7%,transparent)]"
                style={{
                  width: canvasDisplaySize.width,
                  height: canvasDisplaySize.height,
                }}
              >
                <svg
                  className={cn(
                    "absolute inset-0 block size-full touch-none select-none",
                    tool === "eraser" ? "cursor-cell" : "cursor-crosshair",
                  )}
                  viewBox={`0 0 ${project.canvas.width} ${project.canvas.height}`}
                  aria-label="绘图画布"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={finishDrawing}
                  onPointerCancel={finishDrawing}
                >
                  <title>绘图画布</title>
                  <rect
                    width={project.canvas.width}
                    height={project.canvas.height}
                    fill={project.canvas.backgroundColor}
                  />
                  {visiblePaths.map(({ id, path, color, opacity }) => {
                    const erasing = eraserHits.has(id);
                    return (
                      <path
                        key={id}
                        d={path}
                        fill={color}
                        fillOpacity={erasing ? opacity * 0.25 : opacity}
                        pointerEvents="none"
                        style={{ transition: "fill-opacity 90ms ease-out" }}
                      />
                    );
                  })}
                  {drawingPath && (
                    <path
                      d={drawingPath}
                      fill={project.brush.color}
                      fillOpacity={project.brush.opacity}
                      pointerEvents="none"
                    />
                  )}
                  {eraserTrail && (
                    <path
                      d={eraserTrail}
                      fillOpacity={0.32}
                      pointerEvents="none"
                      style={{ fill: "var(--muted-foreground)" }}
                    />
                  )}
                </svg>
                {!project.strokes.length && !drawing.length && (
                  <Empty className="pointer-events-none absolute inset-0 justify-center text-muted-foreground [&_[data-slot=empty-header]]:gap-0">
                    <EmptyHeader>
                      <EmptyMedia
                        variant="icon"
                        className="mb-3.5 size-12 rounded-[14px] border border-dashed border-border bg-transparent text-muted-foreground"
                      >
                        <Pencil />
                      </EmptyMedia>
                      <EmptyTitle className="text-sm font-bold text-foreground">
                        从这里开始绘制
                      </EmptyTitle>
                      <EmptyDescription className="mt-1.5 text-[11px]">
                        按住并拖动鼠标或触控板
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
            )}
          </div>
          <div className="flex min-h-[73px] items-center gap-[15px] border-t border-border bg-[color-mix(in_oklab,var(--card)_92%,transparent)] px-5 pt-[11px] pb-[9px] max-[640px]:gap-2 max-[640px]:px-2.5">
            <div className="flex min-w-[166px] items-center gap-1.5 max-[640px]:min-w-[130px]">
              <IconButton
                label="重播"
                onClick={() => {
                  setCurrentTime(0);
                  setIsPreviewing(false);
                  setShowPlaybackFrame(true);
                }}
              >
                <RotateCcw size={17} />
              </IconButton>
              <Button
                type="button"
                variant="default"
                size="icon-lg"
                className="size-9 rounded-full"
                aria-label={isPreviewing ? "暂停" : "播放"}
                onClick={() =>
                  isPreviewing ? setIsPreviewing(false) : startPlayback()
                }
              >
                {isPreviewing ? (
                  <Pause size={18} fill="currentColor" />
                ) : (
                  <Play fill="currentColor" />
                )}
              </Button>
              <span className="ml-[3px] text-[11px] text-muted-foreground tabular-nums">
                {(currentTime / 1000).toFixed(2)} /{" "}
                {(schedule.duration / 1000).toFixed(2)}s
              </span>
            </div>
            <div className="min-w-[100px] flex-1">
              <Slider
                min={0}
                max={Math.max(1, schedule.duration)}
                value={currentTime}
                aria-label="时间轴"
                onValueChange={(value) => {
                  setIsPreviewing(false);
                  setShowPlaybackFrame(true);
                  setCurrentTime(Number(value));
                }}
                className="block w-full [&_[data-slot=slider-thumb]]:size-2.5 [&_[data-slot=slider-thumb]]:border-primary [&_[data-slot=slider-thumb]]:bg-card [&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-track]]:bg-muted [&_[data-slot=slider-range]]:bg-primary"
              />
              <div className="mt-1.5 flex justify-between text-[9px] text-muted-foreground tabular-nums">
                <span>0s</span>
                <span>{(schedule.duration / 1000).toFixed(1)}s</span>
              </div>
            </div>
            <div className="flex min-w-[120px] items-center justify-end gap-[7px] max-[640px]:min-w-0">
              <IconButton
                label={showPlaybackFrame ? "编辑完整画布" : "预览当前时间点"}
                active={!showPlaybackFrame}
                onClick={() => {
                  setIsPreviewing(false);
                  setShowPlaybackFrame((visible) => !visible);
                }}
              >
                {showPlaybackFrame ? <Pencil size={17} /> : <Eye size={17} />}
              </IconButton>
              <span className="rounded-md bg-muted px-2 py-[5px] text-[10px] text-muted-foreground max-[640px]:hidden">
                {project.strokes.length} 笔
              </span>
              <IconButton
                label="全屏画布"
                onClick={() => stageRef.current?.requestFullscreen?.()}
              >
                <Expand size={17} />
              </IconButton>
            </div>
          </div>
          {playbackError && (
            <Alert
              variant="destructive"
              className="absolute bottom-[88px] left-1/2 flex w-auto -translate-x-1/2 items-center gap-[7px] border-[color-mix(in_oklab,var(--destructive)_30%,var(--border))] bg-[color-mix(in_oklab,var(--destructive)_8%,var(--card))] px-[11px] py-[9px] text-[11px] text-destructive shadow-[0_8px_24px_color-mix(in_oklab,var(--destructive)_10%,transparent)] max-[640px]:right-2.5 max-[640px]:left-2.5 max-[640px]:translate-x-0"
            >
              <X />
              <AlertDescription>{playbackError}</AlertDescription>
              <AlertAction>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="关闭提示"
                  onClick={() => setPlaybackError("")}
                >
                  <X />
                </Button>
              </AlertAction>
            </Alert>
          )}
        </section>

        <aside
          id="editor-settings-desktop"
          className="flex min-h-0 flex-col border-l border-border bg-sidebar max-[980px]:hidden"
        >
          <SettingsPanelContent
            project={project}
            schedule={schedule}
            updateBrush={updateBrush}
            changeRatio={changeRatio}
            setProject={setProject}
          />
          <PanelFooter />
        </aside>
        <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
          <SheetContent
            id="editor-settings-mobile"
            side="right"
            className="w-[min(320px,calc(100vw-50px))] max-w-none gap-0 bg-sidebar p-0"
            showCloseButton={false}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>设置</SheetTitle>
              <SheetDescription>编辑画笔、画布与动画参数</SheetDescription>
            </SheetHeader>
            <div className="flex min-h-[52px] flex-none items-center justify-between border-b border-border pt-0 pr-3 pb-0 pl-[18px] text-[13px] font-bold">
              <span>设置</span>
              <SheetClose
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="关闭设置"
                  />
                }
              >
                <X data-icon="inline-start" />
                <span className="sr-only">关闭设置</span>
              </SheetClose>
            </div>
            <SettingsPanelContent
              project={project}
              schedule={schedule}
              updateBrush={updateBrush}
              changeRatio={changeRatio}
              setProject={setProject}
            />
            <PanelFooter />
          </SheetContent>
        </Sheet>
      </div>

      {loadError && (
        <Alert
          variant="destructive"
          className="fixed right-[26px] bottom-[25px] z-[5] flex w-auto items-center gap-3.5 border-input bg-card px-[13px] py-[11px] text-[11px] text-foreground shadow-[var(--shadow)]"
        >
          <AlertDescription>{loadError}</AlertDescription>
          <AlertAction>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="关闭提示"
              onClick={() => setLoadError("")}
            >
              <X />
            </Button>
          </AlertAction>
        </Alert>
      )}
      <Dialog
        open={exportOpen}
        onOpenChange={(open) => {
          if (!exporting) setExportOpen(open);
        }}
      >
        <DialogContent
          className="w-[min(100%,490px)] gap-0 overflow-hidden p-0 sm:max-w-[490px]"
          showCloseButton={false}
        >
          <DialogHeader className="flex flex-col items-start justify-between border-b border-border px-6 pt-[23px] pb-[18px] [&_[data-slot=dialog-description]]:mt-1.5 [&_[data-slot=dialog-description]]:text-[11px] [&_[data-slot=dialog-description]]:text-muted-foreground [&_[data-slot=dialog-title]]:text-[18px] [&_[data-slot=dialog-title]]:tracking-[-0.03em]">
            <DialogTitle>导出动画</DialogTitle>
            <DialogDescription>
              输出与你在画布中看到的轮廓保持一致
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pt-[19px] pb-5 max-[640px]:px-[18px]">
            <ToggleGroup
              className="grid w-full grid-cols-3 gap-2"
              value={[exportSettings.format]}
              onValueChange={(values) => {
                const format = values[0] as
                  | ExportSettings["format"]
                  | undefined;
                if (!format) return;
                setExportSettings((current) => ({
                  ...current,
                  format,
                  ...(format === "mov"
                    ? { background: "transparent" }
                    : format === "mp4"
                      ? { background: "solid" }
                      : {}),
                }));
              }}
            >
              {(["png", "svg", "webm", "mov", "mp4"] as const).map((format) => (
                <ToggleGroupItem
                  key={format}
                  value={format}
                  className="relative flex h-auto min-h-[78px] min-w-0 flex-col items-start gap-[7px] rounded-[9px] border border-border bg-card p-[11px] text-left whitespace-normal text-muted-foreground hover:bg-card aria-pressed:border-ring aria-pressed:bg-accent aria-pressed:text-foreground [&_small]:text-[9px] [&_small]:text-muted-foreground"
                >
                  <span className="text-[10px] font-extrabold tracking-[0.05em] text-foreground">
                    {format.toUpperCase()}
                  </span>
                  <span>
                    {format === "png"
                      ? "静态图片"
                      : format === "svg"
                        ? "矢量图形"
                        : format === "mov"
                          ? "剪辑视频"
                          : "动画视频"}
                  </span>
                  {format === "mov" && (
                    <small>ProRes 4444 Alpha · 大文件</small>
                  )}
                  {format === "webm" && (
                    <small>
                      {transparentExport ? "VP9 Alpha · 小文件" : "VP9"}
                    </small>
                  )}
                  {format === "mp4" && <small>H.264 · 不透明</small>}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldGroup className="mt-[22px] grid grid-cols-2 gap-x-3 gap-y-[15px] [&_[data-slot=field-label]_output]:float-right [&_[data-slot=field-label]_output]:font-bold [&_[data-slot=field-label]_output]:text-foreground [&_[data-slot=field-label]_output]:tabular-nums [&_[data-slot=field-label]]:text-[11px] [&_[data-slot=field-label]]:text-muted-foreground [&_[data-slot=field]]:flex [&_[data-slot=field]]:flex-col [&_[data-slot=field]]:gap-2 [&_[data-slot=field]]:text-[11px] [&_[data-slot=field]]:text-muted-foreground">
              <Field>
                <FieldLabel>背景</FieldLabel>
                <Select
                  value={getExportBackground(exportSettings)}
                  disabled={
                    exportSettings.format === "mov" ||
                    exportSettings.format === "mp4"
                  }
                  onValueChange={(value) =>
                    setExportSettings((current) => ({
                      ...current,
                      background: value as ExportSettings["background"],
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="solid">
                        纯色（编辑器背景色）
                      </SelectItem>
                      <SelectItem value="transparent">透明</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>画布范围</FieldLabel>
                <Select
                  value={exportSettings.crop}
                  onValueChange={(value) =>
                    setExportSettings((current) => ({
                      ...current,
                      crop: value as ExportSettings["crop"],
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="full">完整画布</SelectItem>
                      <SelectItem value="fit">自适应裁切</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>导出倍率</FieldLabel>
                <Select
                  value={String(exportSettings.scale)}
                  onValueChange={(value) =>
                    setExportSettings((current) => ({
                      ...current,
                      scale: Number(value) as ExportSettings["scale"],
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="1">1×</SelectItem>
                      <SelectItem value="2">2×</SelectItem>
                      <SelectItem value="3">3×</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              {exportSettings.crop === "fit" && (
                <Field>
                  <FieldLabel>
                    留白 <output>{exportSettings.padding}px</output>
                  </FieldLabel>
                  <Slider
                    min={0}
                    max={160}
                    step={4}
                    value={exportSettings.padding}
                    aria-label="留白"
                    onValueChange={(value) =>
                      setExportSettings((current) => ({
                        ...current,
                        padding: Number(value),
                      }))
                    }
                  />
                </Field>
              )}
              {(exportSettings.format === "webm" ||
                exportSettings.format === "mov" ||
                exportSettings.format === "mp4") && (
                <Field>
                  <FieldLabel>帧率</FieldLabel>
                  <Select
                    value={String(exportSettings.fps)}
                    onValueChange={(value) =>
                      setExportSettings((current) => ({
                        ...current,
                        fps: Number(value),
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="24">24 fps</SelectItem>
                        <SelectItem value="30">30 fps</SelectItem>
                        <SelectItem value="60">60 fps</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </FieldGroup>
            <Card
              size="sm"
              className="mt-[21px] bg-[color-mix(in_oklab,var(--muted)_35%,var(--card))]"
            >
              <CardContent className="flex items-center gap-2 text-[11px] text-muted-foreground [&_small]:text-[9px] [&_small]:text-muted-foreground">
                <span>预计尺寸</span>
                <strong className="ml-auto text-xs text-foreground">
                  {dimensions.width} × {dimensions.height}px
                </strong>
                {(exportSettings.format === "webm" ||
                  exportSettings.format === "mov" ||
                  exportSettings.format === "mp4") && (
                  <small>
                    {exportSettings.format === "mov"
                      ? "· ProRes 4444 Alpha · 剪辑兼容 · 文件较大"
                      : exportSettings.format === "webm"
                        ? transparentExport
                          ? "· VP9 Alpha · 透明小文件 · 导出后验证"
                          : "· VP9 · 纯色背景"
                        : "· H.264 · 纯色背景"}
                  </small>
                )}
              </CardContent>
            </Card>
            {exportError && (
              <Alert
                variant="destructive"
                className="mt-3.5 flex items-center gap-[7px] border-[color-mix(in_oklab,var(--destructive)_30%,var(--border))] bg-[color-mix(in_oklab,var(--destructive)_8%,var(--card))] px-[11px] py-[9px] text-[11px] text-destructive"
              >
                <X />
                <AlertDescription className="flex-1 text-destructive">
                  {exportError}
                </AlertDescription>
                <AlertAction>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="关闭错误"
                    onClick={() => setExportError("")}
                  >
                    <X />
                  </Button>
                </AlertAction>
              </Alert>
            )}
            {exporting && exportProgress !== null && (
              <div
                className="mt-3.5 flex flex-col gap-2 border-t border-border pt-3.5"
                aria-live="polite"
              >
                <div className="flex justify-between text-[11px] text-muted-foreground [&_output]:font-bold [&_output]:text-foreground">
                  <span>正在编码视频</span>
                  <output>{exportProgress}%</output>
                </div>
                <Progress value={exportProgress} aria-label="导出进度" />
              </div>
            )}
          </div>
          <DialogFooter className="m-0 flex justify-end gap-2 border-t border-border bg-sidebar px-6 py-3.5 max-[640px]:px-[18px]">
            <Button
              type="button"
              variant="ghost"
              className="h-[35px] px-3.5 text-xs text-muted-foreground"
              onClick={() => setExportOpen(false)}
              disabled={exporting}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="default"
              className="h-[35px] px-3.5 text-xs font-bold"
              onClick={handleExport}
              disabled={exporting || !project.strokes.length}
            >
              {exporting
                ? exportProgress === null
                  ? "导出中…"
                  : `导出中 ${exportProgress}%`
                : `导出 ${exportSettings.format.toUpperCase()}`}
              <Download data-icon="inline-end" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
