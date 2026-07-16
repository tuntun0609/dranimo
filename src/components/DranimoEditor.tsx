"use client";

import {
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  Eraser,
  Expand,
  Eye,
  FileImage,
  Gauge,
  Layers3,
  MoreHorizontal,
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
import { useEffect, useMemo, useRef, useState } from "react";
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
import { loadProject, saveProject } from "@/lib/persistence";
import { buildPlaybackSchedule, getVisibleStrokes } from "@/lib/playback";
import { pointHitsStroke, strokePath } from "@/lib/stroke-geometry";
import {
  type BrushSettings,
  CANVAS_PRESETS,
  createDefaultProject,
  type ExportSettings,
  type PlaybackMode,
  type ProjectV1,
  type StrokePoint,
  type StrokeRecord,
  type Tool,
} from "@/lib/types";

const COLORS = [
  "#000000",
  "#d86a49",
  "#3478c4",
  "#d8a23c",
  "#8d5ba8",
  "#e64e72",
  "#ffffff",
];

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

function IconButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "active" : ""}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="settings-section" open={defaultOpen}>
      <summary>
        {icon}
        <span>{title}</span>
        <ChevronDown size={15} />
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

export default function DranimoEditor() {
  const [project, setProject] = useState<ProjectV1>(createDefaultProject);
  const [undo, setUndo] = useState<StrokeRecord[][]>([]);
  const [redo, setRedo] = useState<StrokeRecord[][]>([]);
  const [tool, setTool] = useState<Tool>("brush");
  const [drawing, setDrawing] = useState<StrokePoint[]>([]);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [showPlaybackFrame, setShowPlaybackFrame] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackError, setPlaybackError] = useState("");
  const [loadError, setLoadError] = useState("");
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
  const [stageSize, setStageSize] = useState({ width: 640, height: 640 });
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<StrokePoint[]>([]);
  const activePointerIdRef = useRef<number | null>(null);
  const animationRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const playbackTimeRef = useRef(0);
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
    const availableWidth = Math.max(1, stageSize.width - 40);
    const availableHeight = Math.max(1, stageSize.height - 40);
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

  useEffect(() => {
    let mounted = true;
    loadProject().then(({ project: stored, error }) => {
      if (!mounted) return;
      if (stored) setProject(stored);
      if (error) setLoadError(error);
      wasLoaded.current = true;
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!wasLoaded.current) return;
    const timer = window.setTimeout(() => {
      saveProject(project).then(() => setSavedAt(Date.now()));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [project]);

  useEffect(() => {
    if (!stageRef.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setStageSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    playbackTimeRef.current = currentTime;
  }, [currentTime]);

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

  const commitStrokes = (next: StrokeRecord[]) => {
    setUndo((items) => [...items, project.strokes]);
    setRedo([]);
    setProject((current) => ({ ...current, strokes: next }));
    saveProject({ ...project, strokes: next }).then(() =>
      setSavedAt(Date.now()),
    );
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

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerIdRef.current = event.pointerId;
    setIsPreviewing(false);
    setShowPlaybackFrame(false);
    const points = pointsFromEvent(event);
    drawingRef.current = points;
    setDrawing(points);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
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
    if (points.length === 0) return;
    if (tool === "eraser") {
      const next = project.strokes.filter(
        (stroke) =>
          !points.some((point) =>
            pointHitsStroke(point, stroke, project.brush.size * 0.65),
          ),
      );
      if (next.length !== project.strokes.length) commitStrokes(next);
      return;
    }
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
          "dranimo-animation.svg",
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
        downloadBlob(blob, `dranimo-animation.${exportSettings.format}`);
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
        downloadBlob(await canvasToPng(canvas), "dranimo-animation.png");
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
  const progress = schedule.duration
    ? Math.min(100, (currentTime / schedule.duration) * 100)
    : 0;

  return (
    <main className="editor-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Sparkles size={16} />
          </div>
          <span>dranimo</span>
          <span className="beta">MVP</span>
        </div>
        <div className="topbar-center">
          <span className="project-name">untitled animation</span>
          <span className="saved-state">{savedAt ? "已保存" : "本地项目"}</span>
        </div>
        <div className="topbar-actions">
          <IconButton
            label="帮助"
            onClick={() =>
              setLoadError("提示：在画布上拖动即可绘制，橡皮擦会整笔删除")
            }
          >
            <CircleHelp size={18} />
          </IconButton>
          <IconButton
            label="更多"
            onClick={() => setLoadError("Dranimo 项目保存在当前浏览器中")}
          >
            <MoreHorizontal size={18} />
          </IconButton>
          <button
            type="button"
            className="export-top-button"
            onClick={() => setExportOpen(true)}
            disabled={!project.strokes.length}
          >
            <Download size={16} />
            导出
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="left-rail">
          <div className="rail-group">
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
          <div className="rail-divider" />
          <div className="rail-group">
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
          <div className="rail-bottom">
            <IconButton
              label="清空画布"
              disabled={!project.strokes.length}
              onClick={() => commitStrokes([])}
            >
              <Trash2 size={18} />
            </IconButton>
          </div>
        </aside>

        <section className="canvas-area">
          <div className="canvas-toolbar">
            <div className="tool-context">
              <span
                className="tool-dot"
                style={{
                  background:
                    tool === "eraser" ? "#d86a49" : project.brush.color,
                }}
              />
              <span>{tool === "eraser" ? "整笔橡皮擦" : "画笔"}</span>
              <span className="toolbar-hint">
                {tool === "eraser" ? "拖动删除整笔" : `${project.brush.size}px`}
              </span>
            </div>
            <div className="canvas-meta">
              <span>{ratioLabel}</span>
              <span>
                {project.canvas.width} × {project.canvas.height}
              </span>
            </div>
          </div>
          <div className="stage" ref={stageRef}>
            <div
              className="canvas-wrap"
              style={{
                width: canvasDisplaySize.width,
                height: canvasDisplaySize.height,
              }}
            >
              <svg
                className={`drawing-surface ${tool === "eraser" ? "eraser-cursor" : "brush-cursor"}`}
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
                {visiblePaths.map(({ id, path, color, opacity }) => (
                  <path
                    key={id}
                    d={path}
                    fill={color}
                    fillOpacity={opacity}
                    pointerEvents="none"
                  />
                ))}
                {drawingPath && (
                  <path
                    d={drawingPath}
                    fill={project.brush.color}
                    fillOpacity={project.brush.opacity}
                    pointerEvents="none"
                  />
                )}
              </svg>
              {!project.strokes.length && !drawing.length && (
                <div className="canvas-empty">
                  <div className="empty-icon">
                    <Pencil size={22} />
                  </div>
                  <p>从这里开始绘制</p>
                  <span className="empty-hint">按住并拖动鼠标或触控板</span>
                </div>
              )}
            </div>
          </div>
          <div className="playback-bar">
            <div className="playback-controls">
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
              <button
                type="button"
                className="play-button"
                aria-label={isPreviewing ? "暂停" : "播放"}
                onClick={() =>
                  isPreviewing ? setIsPreviewing(false) : startPlayback()
                }
              >
                {isPreviewing ? (
                  <Pause size={18} fill="currentColor" />
                ) : (
                  <Play size={18} fill="currentColor" />
                )}
              </button>
              <span className="time-readout">
                {(currentTime / 1000).toFixed(2)} /{" "}
                {(schedule.duration / 1000).toFixed(2)}s
              </span>
            </div>
            <div className="timeline">
              <input
                type="range"
                min="0"
                max={Math.max(1, schedule.duration)}
                value={currentTime}
                onChange={(event) => {
                  setIsPreviewing(false);
                  setShowPlaybackFrame(true);
                  setCurrentTime(Number(event.target.value));
                }}
                style={{ "--progress": `${progress}%` } as React.CSSProperties}
              />
              <div className="timeline-labels">
                <span>0s</span>
                <span>{(schedule.duration / 1000).toFixed(1)}s</span>
              </div>
            </div>
            <div className="playback-extra">
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
              <span className="stroke-count">{project.strokes.length} 笔</span>
              <IconButton
                label="全屏画布"
                onClick={() => stageRef.current?.requestFullscreen?.()}
              >
                <Expand size={17} />
              </IconButton>
            </div>
          </div>
          {playbackError && (
            <div className="inline-alert">
              <X size={15} />
              <span>{playbackError}</span>
              <button type="button" onClick={() => setPlaybackError("")}>
                <X size={13} />
              </button>
            </div>
          )}
        </section>

        <aside className="settings-panel">
          <div className="panel-scroll">
            <Section title="画笔" icon={<Pencil size={16} />}>
              <div className="color-row">
                {COLORS.map((color) => (
                  <button
                    type="button"
                    key={color}
                    aria-label={`颜色 ${color}`}
                    className={`color-swatch ${project.brush.color === color ? "selected" : ""}`}
                    style={{ background: color }}
                    onClick={() => updateBrush({ color })}
                  >
                    {project.brush.color === color && (
                      <Check
                        size={14}
                        color={color === "#ffffff" ? "#000000" : "white"}
                      />
                    )}
                  </button>
                ))}
                <label className="custom-color">
                  <input
                    type="color"
                    value={project.brush.color}
                    onChange={(event) =>
                      updateBrush({ color: event.target.value })
                    }
                  />
                </label>
              </div>
              <label className="field-label">
                <span className="field-value">
                  粗细 <output>{project.brush.size}px</output>
                </span>
                <input
                  type="range"
                  min="1"
                  max="80"
                  value={project.brush.size}
                  onChange={(event) =>
                    updateBrush({ size: Number(event.target.value) })
                  }
                />
              </label>
              <label className="field-label">
                <span className="field-value">
                  透明度{" "}
                  <output>{Math.round(project.brush.opacity * 100)}%</output>
                </span>
                <input
                  type="range"
                  min="0.05"
                  max="1"
                  step="0.05"
                  value={project.brush.opacity}
                  onChange={(event) =>
                    updateBrush({ opacity: Number(event.target.value) })
                  }
                />
              </label>
              <details className="advanced">
                <summary>
                  高级设置 <ChevronDown size={14} />
                </summary>
                <div className="advanced-grid">
                  <label>
                    Thinning
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.05"
                      value={project.brush.thinning}
                      onChange={(event) =>
                        updateBrush({ thinning: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Smoothing
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={project.brush.smoothing}
                      onChange={(event) =>
                        updateBrush({ smoothing: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Streamline
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={project.brush.streamline}
                      onChange={(event) =>
                        updateBrush({ streamline: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    压力模拟
                    <select
                      value={project.brush.simulatePressure ? "yes" : "no"}
                      onChange={(event) =>
                        updateBrush({
                          simulatePressure: event.target.value === "yes",
                        })
                      }
                    >
                      <option value="yes">开启</option>
                      <option value="no">关闭</option>
                    </select>
                  </label>
                </div>
              </details>
            </Section>
            <Section title="画布" icon={<Layers3 size={16} />}>
              <div className="ratio-grid">
                {Object.entries(CANVAS_PRESETS).map(([key, preset]) => (
                  <button
                    type="button"
                    key={key}
                    className={project.canvas.ratio === key ? "selected" : ""}
                    onClick={() =>
                      changeRatio(key as keyof typeof CANVAS_PRESETS)
                    }
                  >
                    <span className={`ratio-icon ratio-${key}`} />
                    <strong>{preset.label}</strong>
                    <small>
                      {preset.width}×{preset.height}
                    </small>
                  </button>
                ))}
              </div>
              <label className="background-color">
                <span>背景色</span>
                <input
                  type="color"
                  value={project.canvas.backgroundColor}
                  onChange={(event) =>
                    setProject((current) => ({
                      ...current,
                      canvas: {
                        ...current.canvas,
                        backgroundColor: event.target.value,
                      },
                    }))
                  }
                />
                <code>{project.canvas.backgroundColor}</code>
              </label>
            </Section>
            <Section title="动画节奏" icon={<Gauge size={16} />}>
              <div className="mode-tabs">
                {(["real", "fixed", "total"] as PlaybackMode[]).map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    className={project.playback.mode === mode ? "selected" : ""}
                    onClick={() =>
                      setProject((current) => ({
                        ...current,
                        playback: { ...current.playback, mode },
                      }))
                    }
                  >
                    {mode === "real"
                      ? "真实速度"
                      : mode === "fixed"
                        ? "固定速度"
                        : "总时长"}
                  </button>
                ))}
              </div>
              {project.playback.mode === "fixed" && (
                <label className="field-label">
                  <span className="field-value">
                    速度 <output>{project.playback.fixedSpeed} px/s</output>
                  </span>
                  <input
                    type="range"
                    min="100"
                    max="1600"
                    step="50"
                    value={project.playback.fixedSpeed}
                    onChange={(event) =>
                      setProject((current) => ({
                        ...current,
                        playback: {
                          ...current.playback,
                          fixedSpeed: Number(event.target.value),
                        },
                      }))
                    }
                  />
                </label>
              )}
              {project.playback.mode === "total" && (
                <label className="field-label">
                  <span className="field-value">
                    总时长{" "}
                    <output>
                      {(project.playback.totalDuration / 1000).toFixed(1)}s
                    </output>
                  </span>
                  <input
                    type="range"
                    min="500"
                    max="60000"
                    step="100"
                    value={project.playback.totalDuration}
                    onChange={(event) =>
                      setProject((current) => ({
                        ...current,
                        playback: {
                          ...current.playback,
                          totalDuration: Number(event.target.value),
                        },
                      }))
                    }
                  />
                </label>
              )}
              <label className="field-label">
                <span className="field-value">
                  笔画间隔 <output>{project.playback.strokeGap}ms</output>
                </span>
                <input
                  type="range"
                  min="0"
                  max="500"
                  step="10"
                  value={project.playback.strokeGap}
                  onChange={(event) =>
                    setProject((current) => ({
                      ...current,
                      playback: {
                        ...current.playback,
                        strokeGap: Number(event.target.value),
                      },
                    }))
                  }
                />
              </label>
              {schedule.warning && (
                <div className="warning-note">{schedule.warning}</div>
              )}
            </Section>
            <Section
              title="导出"
              icon={<Download size={16} />}
              defaultOpen={false}
            >
              <div className="export-mini">
                <div>
                  <FileImage size={18} />
                  <span>PNG / SVG / WebM</span>
                </div>
                <button
                  type="button"
                  onClick={() => setExportOpen(true)}
                  disabled={!project.strokes.length}
                >
                  设置
                </button>
              </div>
            </Section>
          </div>
          <div className="panel-footer">
            <Volume2 size={15} />
            <span>本地优先 · 自动保存</span>
            <span className="footer-spacer" />
            <Settings2 size={15} />
          </div>
        </aside>
      </div>

      {loadError && (
        <div className="toast">
          <span>{loadError}</span>
          <button type="button" onClick={() => setLoadError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {exportOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="export-modal" role="dialog" aria-modal="true">
            <div className="modal-head">
              <div>
                <h2>导出动画</h2>
                <p>输出与你在画布中看到的轮廓保持一致</p>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={() => setExportOpen(false)}
                disabled={exporting}
              >
                <X size={19} />
              </button>
            </div>
            <div className="export-form">
              <div className="format-options">
                {(["png", "svg", "webm", "mov", "mp4"] as const).map(
                  (format) => (
                    <button
                      type="button"
                      key={format}
                      className={
                        exportSettings.format === format ? "selected" : ""
                      }
                      onClick={() =>
                        setExportSettings((current) => ({
                          ...current,
                          format,
                          ...(format === "mov"
                            ? { background: "transparent" }
                            : format === "mp4"
                              ? { background: "solid" }
                              : {}),
                        }))
                      }
                    >
                      <span className="format-badge">
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
                    </button>
                  ),
                )}
              </div>
              <div className="form-grid">
                <label>
                  <span>背景</span>
                  <select
                    value={getExportBackground(exportSettings)}
                    disabled={
                      exportSettings.format === "mov" ||
                      exportSettings.format === "mp4"
                    }
                    onChange={(event) =>
                      setExportSettings((current) => ({
                        ...current,
                        background: event.target
                          .value as ExportSettings["background"],
                      }))
                    }
                  >
                    <option value="solid">纯色（编辑器背景色）</option>
                    <option value="transparent">透明</option>
                  </select>
                </label>
                <label>
                  <span>画布范围</span>
                  <select
                    value={exportSettings.crop}
                    onChange={(event) =>
                      setExportSettings((current) => ({
                        ...current,
                        crop: event.target.value as ExportSettings["crop"],
                      }))
                    }
                  >
                    <option value="full">完整画布</option>
                    <option value="fit">自适应裁切</option>
                  </select>
                </label>
                <label>
                  <span>导出倍率</span>
                  <select
                    value={exportSettings.scale}
                    onChange={(event) =>
                      setExportSettings((current) => ({
                        ...current,
                        scale: Number(
                          event.target.value,
                        ) as ExportSettings["scale"],
                      }))
                    }
                  >
                    <option value="1">1×</option>
                    <option value="2">2×</option>
                    <option value="3">3×</option>
                  </select>
                </label>
                {exportSettings.crop === "fit" && (
                  <label>
                    <span>
                      留白 <output>{exportSettings.padding}px</output>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="160"
                      step="4"
                      value={exportSettings.padding}
                      onChange={(event) =>
                        setExportSettings((current) => ({
                          ...current,
                          padding: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                )}
                {(exportSettings.format === "webm" ||
                  exportSettings.format === "mov" ||
                  exportSettings.format === "mp4") && (
                  <label>
                    <span>帧率</span>
                    <select
                      value={exportSettings.fps}
                      onChange={(event) =>
                        setExportSettings((current) => ({
                          ...current,
                          fps: Number(event.target.value),
                        }))
                      }
                    >
                      <option value="24">24 fps</option>
                      <option value="30">30 fps</option>
                      <option value="60">60 fps</option>
                    </select>
                  </label>
                )}
              </div>
              <div className="export-summary">
                <span>预计尺寸</span>
                <strong>
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
              </div>
              {exportError && (
                <div className="export-error" role="alert">
                  <X size={15} />
                  <span className="export-error-message">{exportError}</span>
                  <button type="button" onClick={() => setExportError("")}>
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setExportOpen(false)}
                disabled={exporting}
              >
                取消
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleExport}
                disabled={exporting || !project.strokes.length}
              >
                {exporting
                  ? exportProgress === null
                    ? "导出中…"
                    : `导出中 ${exportProgress}%`
                  : `导出 ${exportSettings.format.toUpperCase()}`}
                <Download size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
