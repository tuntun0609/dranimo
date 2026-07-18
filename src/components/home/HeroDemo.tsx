"use client";

import {
  Check,
  Eraser,
  Pause,
  Pencil,
  Play,
  Redo2,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

const PHASES = [
  {
    value: "draw",
    label: "绘制",
    icon: Pencil,
    caption: "鼠标、触控板或触屏，直接画下每一笔",
    dwell: 3000,
  },
  {
    value: "play",
    label: "回放",
    icon: Play,
    caption: "按节奏回放，线条在恰当的时间出现",
    dwell: 2800,
  },
] as const;

type DemoPhase = (typeof PHASES)[number]["value"];

// Displayed clip length; the drawing/playback visuals are timed to match.
const TOTAL_SECONDS = 2.4;
const DRAW_MS = 2420;
const PLAY_MS = 2400;
// Auto-play resumes this long after the last manual interaction.
const IDLE_RESUME_MS = 9000;

export function HeroDemo() {
  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const playheadRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<DemoPhase>("draw");
  const [autoplay, setAutoplay] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  const active = PHASES.find((item) => item.value === phase) ?? PHASES[0];
  const paused = !isVisible || !pageVisible;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const sync = () => setPageVisible(!document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.2 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Advance phases on a per-phase dwell timer. Continues under reduced motion
  // so every step stays visible; only the sub-animations are suppressed.
  useEffect(() => {
    if (!autoplay || paused) return;
    const dwell = reducedMotion ? active.dwell + 900 : active.dwell;
    const timer = window.setTimeout(() => {
      const index = PHASES.findIndex((item) => item.value === phase);
      setPhase(PHASES[(index + 1) % PHASES.length].value);
    }, dwell);
    return () => window.clearTimeout(timer);
  }, [active, autoplay, paused, phase, reducedMotion]);

  // Drive the timeline (progress bar, playhead, timecode) so every element
  // reads from one clock instead of drifting apart.
  useEffect(() => {
    const paint = (ratio: number) => {
      const clamped = Math.min(Math.max(ratio, 0), 1);
      const percent = `${(clamped * 100).toFixed(2)}%`;
      if (progressRef.current) progressRef.current.style.width = percent;
      if (playheadRef.current) playheadRef.current.style.left = percent;
      if (timeRef.current) {
        timeRef.current.textContent = `${(clamped * TOTAL_SECONDS).toFixed(2)} / ${TOTAL_SECONDS.toFixed(2)}s`;
      }
    };

    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // Reduced motion or off-screen: hold the finished frame.
    if (reducedMotion || paused) {
      paint(1);
      return;
    }

    const duration = phase === "play" ? PLAY_MS : DRAW_MS;
    const loop = phase === "play";
    const start = performance.now();
    paint(0);

    const tick = (now: number) => {
      const elapsed = now - start;
      const ratio = loop ? (elapsed % duration) / duration : elapsed / duration;
      paint(ratio);
      if (!loop && elapsed >= duration) {
        rafRef.current = null;
        return;
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [phase, reducedMotion, paused]);

  useEffect(
    () => () => {
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
      }
    },
    [],
  );

  const handleSelect = useCallback((next: DemoPhase) => {
    setPhase(next);
    setAutoplay(false);
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = window.setTimeout(
      () => setAutoplay(true),
      IDLE_RESUME_MS,
    );
  }, []);

  return (
    <div
      ref={rootRef}
      className={cn("hero-demo", paused && "is-paused")}
      data-phase={phase}
    >
      <p className="sr-only">
        Dranimo 功能演示：在画布上绘制笔画、按时间轴回放，并导出图片或视频。
      </p>

      <div className="hero-demo-head">
        <div className="hero-demo-caption" aria-live="polite">
          <active.icon size={15} />
          <strong>{active.label}</strong>
          <span>{active.caption}</span>
        </div>
        <ToggleGroup
          aria-label="选择功能演示阶段"
          className="hero-demo-toggle"
          value={[phase]}
          variant="outline"
          size="sm"
          spacing={0}
          onValueChange={(values) => {
            const next = values[0] as DemoPhase | undefined;
            if (next) handleSelect(next);
          }}
        >
          {PHASES.map(({ value, label, icon: Icon }) => (
            <ToggleGroupItem key={value} value={value} aria-label={label}>
              <Icon data-icon="inline-start" />
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="hero-demo-workspace" aria-hidden="true">
        <div className="hero-demo-toolbar">
          <div className="hero-demo-tool is-active">
            <Pencil size={18} />
          </div>
          <div className="hero-demo-tool">
            <Eraser size={18} />
          </div>
          <Separator className="hero-demo-tool-separator" />
          <div className="hero-demo-tool">
            <Undo2 size={17} />
          </div>
          <div className="hero-demo-tool">
            <Redo2 size={17} />
          </div>
        </div>

        <div className="hero-demo-stage">
          <div className="hero-demo-stagebar">
            <span className="hero-demo-status-dot" />
            <strong>画笔</strong>
            <span>14px</span>
            <span className="hero-demo-stagebar-spacer" />
            <span>1080 x 1080</span>
          </div>
          <div className="hero-demo-canvas-wrap">
            <div className="hero-demo-canvas">
              <svg
                viewBox="0 0 720 410"
                role="presentation"
                preserveAspectRatio="xMidYMid meet"
              >
                <path
                  className="hero-demo-stroke hero-demo-stroke-one"
                  d="M112 238 C160 132 258 118 320 188 C366 241 427 243 481 169"
                  pathLength="1"
                />
                <path
                  className="hero-demo-stroke hero-demo-stroke-two"
                  d="M181 272 C229 325 326 331 383 267 C419 227 466 217 527 244"
                  pathLength="1"
                />
                <path
                  className="hero-demo-stroke hero-demo-stroke-three"
                  d="M502 115 L514 143 L544 147 L520 165 L527 195 L502 179 L477 195 L484 165 L460 147 L490 143 Z"
                  pathLength="1"
                />
                <path
                  className="hero-demo-stroke hero-demo-stroke-four"
                  d="M153 331 C248 354 377 354 548 317"
                  pathLength="1"
                />
                <g className="hero-demo-cursor">
                  <circle r="11" />
                  <circle r="3" />
                </g>
              </svg>
            </div>
          </div>
          <div className="hero-demo-timeline">
            <div className="hero-demo-play">
              {phase === "play" ? <Pause size={15} /> : <Play size={15} />}
            </div>
            <span className="hero-demo-time" ref={timeRef}>
              0.00 / {TOTAL_SECONDS.toFixed(2)}s
            </span>
            <div className="hero-demo-track">
              <span className="hero-demo-progress" ref={progressRef} />
              <span className="hero-demo-playhead" ref={playheadRef} />
            </div>
            <span className="hero-demo-stroke-count">4 笔</span>
          </div>
        </div>

        <div className="hero-demo-inspector">
          <div className="hero-demo-inspector-heading">
            <Pencil size={17} />
            <strong>画笔</strong>
          </div>
          <div className="hero-demo-swatches">
            <span className="is-selected" />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="hero-demo-setting">
            <span>粗细</span>
            <strong>14px</strong>
            <div className="hero-demo-slider hero-demo-slider-short" />
          </div>
          <div className="hero-demo-setting">
            <span>透明度</span>
            <strong>100%</strong>
            <div className="hero-demo-slider" />
          </div>
          <Separator />
          <div className="hero-demo-inspector-heading">
            <SlidersHorizontal size={17} />
            <strong>动画节奏</strong>
          </div>
          <div className="hero-demo-mode-row">
            <span>真实</span>
            <span className="is-selected">固定</span>
            <span>总时长</span>
          </div>
          <Badge variant="secondary">
            <Check data-icon="inline-start" />
            本地自动保存
          </Badge>
        </div>
      </div>
    </div>
  );
}
