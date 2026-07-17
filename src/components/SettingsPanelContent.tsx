"use client";

import { Check, Gauge, Layers3, Pencil } from "lucide-react";
import type * as React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  type BrushSettings,
  CANVAS_PRESETS,
  type PlaybackMode,
  type PlaybackSchedule,
  type ProjectV1,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const COLORS = [
  "#000000",
  "#d86a49",
  "#3478c4",
  "#d8a23c",
  "#8d5ba8",
  "#e64e72",
  "#ffffff",
];

const RATIO_ICON: Record<string, string> = {
  square: "size-6",
  landscape: "my-0.5 h-5 w-[30px]",
  portrait: "-my-[3px] h-[30px] w-5",
};
function SettingsSection({
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
    <Accordion
      className="border-b border-border"
      defaultValue={defaultOpen ? [title] : []}
    >
      <AccordionItem value={title} className="border-b-0">
        <AccordionTrigger className="items-center px-[18px] py-4 text-xs font-bold text-foreground hover:no-underline">
          <span className="inline-flex items-center gap-[9px] [&_svg]:size-4 [&_svg]:text-muted-foreground">
            {icon}
            <span>{title}</span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="px-[18px] pt-0 pb-[18px]">
          {children}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

interface SettingsPanelContentProps {
  project: ProjectV1;
  schedule: PlaybackSchedule;
  updateBrush: (patch: Partial<BrushSettings>) => void;
  changeRatio: (ratio: keyof typeof CANVAS_PRESETS) => void;
  setProject: React.Dispatch<React.SetStateAction<ProjectV1>>;
}

const sliderFieldLabel = "block text-[11px] text-muted-foreground";
const sliderValueRow =
  "flex justify-between [&_output]:font-bold [&_output]:text-foreground [&_output]:tabular-nums";
export function SettingsPanelContent({
  project,
  schedule,
  updateBrush,
  changeRatio,
  setProject,
}: SettingsPanelContentProps) {
  return (
    <div className="flex-1 overflow-auto [scrollbar-width:thin]">
      <SettingsSection title="画笔" icon={<Pencil />}>
        <FieldSet className="gap-2">
          <FieldLegend variant="label" className="sr-only">
            画笔颜色
          </FieldLegend>
          <Field
            orientation="horizontal"
            className="flex-wrap items-center gap-2.5"
          >
            <ToggleGroup
              className="flex flex-wrap items-center gap-2"
              value={[project.brush.color]}
              onValueChange={(values) => {
                const color = values[0];
                if (color) updateBrush({ color });
              }}
            >
              {COLORS.map((color) => (
                <ToggleGroupItem
                  key={color}
                  value={color}
                  aria-label={`颜色 ${color}`}
                  className="size-6 min-w-0 rounded-full border-2 border-transparent p-0 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_12%,transparent)] hover:bg-transparent aria-pressed:border-foreground aria-pressed:bg-transparent aria-pressed:shadow-[0_0_0_2px_var(--sidebar),0_0_0_3px_var(--foreground)]"
                  style={{ background: color }}
                >
                  {project.brush.color === color && (
                    <Check
                      data-icon="inline-start"
                      color={
                        color === "#ffffff"
                          ? "var(--foreground)"
                          : "var(--primary-foreground)"
                      }
                    />
                  )}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Field className="w-auto gap-0 [&_[data-slot=field-label]]:hidden">
              <FieldLabel htmlFor="custom-brush-color" className="sr-only">
                自定义画笔颜色
              </FieldLabel>
              <Input
                id="custom-brush-color"
                type="color"
                value={project.brush.color}
                aria-label="自定义画笔颜色"
                className="size-6 min-h-0 min-w-0 cursor-pointer overflow-hidden rounded-full border-2 border-transparent p-0 [background:conic-gradient(#e46c5a,#efcb52,#68b889,#609bd4,#b47ac5,#e46c5a)] focus-visible:border-foreground focus-visible:ring-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                onChange={(event) => updateBrush({ color: event.target.value })}
              />
            </Field>
          </Field>
        </FieldSet>
        <FieldGroup>
          <Field className={cn("mt-[18px]", sliderFieldLabel)}>
            <FieldLabel htmlFor="brush-size-slider">
              <span className={cn(sliderValueRow, "mb-[9px]")}>
                粗细 <output>{project.brush.size}px</output>
              </span>
            </FieldLabel>
            <Slider
              id="brush-size-slider"
              min={1}
              max={80}
              value={project.brush.size}
              aria-label="画笔粗细"
              onValueChange={(value) => updateBrush({ size: Number(value) })}
            />
          </Field>
          <Field className={cn("mt-[18px]", sliderFieldLabel)}>
            <FieldLabel htmlFor="brush-opacity-slider">
              <span className={cn(sliderValueRow, "mb-[9px]")}>
                透明度{" "}
                <output>{Math.round(project.brush.opacity * 100)}%</output>
              </span>
            </FieldLabel>
            <Slider
              id="brush-opacity-slider"
              min={0.05}
              max={1}
              step={0.05}
              value={project.brush.opacity}
              aria-label="画笔透明度"
              onValueChange={(value) => updateBrush({ opacity: Number(value) })}
            />
          </Field>
        </FieldGroup>

        <Accordion
          className="mt-4 border-t border-border"
          defaultValue={["brush-advanced"]}
        >
          <AccordionItem value="brush-advanced" className="border-b-0">
            <AccordionTrigger className="py-3 pb-0.5 text-[11px] font-normal text-muted-foreground hover:no-underline">
              高级设置
            </AccordionTrigger>
            <AccordionContent className="pt-0 pb-0">
              <FieldGroup className="grid grid-cols-2 gap-x-2.5 gap-y-3 pt-3 [&_[data-slot=field]]:text-[10px] [&_[data-slot=field]]:text-muted-foreground [&_[data-slot=select-trigger]]:mt-[7px] [&_[data-slot=select-trigger]]:w-full [&_[data-slot=slider]]:mt-[7px] [&_[data-slot=slider]]:block [&_[data-slot=slider]]:w-full">
                <Field>
                  <FieldLabel htmlFor="brush-thinning-slider">
                    Thinning
                  </FieldLabel>
                  <Slider
                    id="brush-thinning-slider"
                    min={-1}
                    max={1}
                    step={0.05}
                    value={project.brush.thinning}
                    aria-label="Thinning"
                    onValueChange={(value) =>
                      updateBrush({ thinning: Number(value) })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="brush-smoothing-slider">
                    Smoothing
                  </FieldLabel>
                  <Slider
                    id="brush-smoothing-slider"
                    min={0}
                    max={1}
                    step={0.05}
                    value={project.brush.smoothing}
                    aria-label="Smoothing"
                    onValueChange={(value) =>
                      updateBrush({ smoothing: Number(value) })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="brush-streamline-slider">
                    Streamline
                  </FieldLabel>
                  <Slider
                    id="brush-streamline-slider"
                    min={0}
                    max={1}
                    step={0.05}
                    value={project.brush.streamline}
                    aria-label="Streamline"
                    onValueChange={(value) =>
                      updateBrush({ streamline: Number(value) })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="pressure-simulation-select">
                    压力模拟
                  </FieldLabel>
                  <Select
                    value={project.brush.simulatePressure ? "yes" : "no"}
                    onValueChange={(value) =>
                      updateBrush({ simulatePressure: value === "yes" })
                    }
                  >
                    <SelectTrigger
                      id="pressure-simulation-select"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="yes">开启</SelectItem>
                        <SelectItem value="no">关闭</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </SettingsSection>
      <SettingsSection title="画布" icon={<Layers3 />}>
        <FieldSet className="gap-2">
          <FieldLegend variant="label">画布比例</FieldLegend>
          <ToggleGroup
            className="grid w-full grid-cols-3 gap-[7px]"
            value={[project.canvas.ratio]}
            onValueChange={(values) => {
              const ratio = values[0];
              if (ratio && ratio in CANVAS_PRESETS) {
                changeRatio(ratio as keyof typeof CANVAS_PRESETS);
              }
            }}
          >
            {Object.entries(CANVAS_PRESETS).map(([key, preset]) => (
              <ToggleGroupItem
                key={key}
                value={key}
                className="flex h-auto min-w-0 flex-col items-center gap-1.5 rounded-lg border border-border bg-card px-[5px] pt-2.5 pb-[9px] text-muted-foreground hover:border-ring hover:bg-accent hover:text-foreground aria-pressed:border-ring aria-pressed:bg-accent aria-pressed:text-foreground"
              >
                <span
                  className={cn(
                    "block rounded-[2px] border-[1.5px] border-current",
                    RATIO_ICON[key],
                  )}
                />
                <strong className="text-[11px]">{preset.label}</strong>
                <small className="text-[8px] text-muted-foreground">
                  {preset.width}×{preset.height}
                </small>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FieldSet>
        <FieldGroup className="mt-[18px]">
          <Field
            orientation="horizontal"
            className="w-full items-center justify-between text-[11px] text-muted-foreground"
          >
            <FieldLabel
              htmlFor="canvas-background-color"
              className="text-[11px] text-muted-foreground"
            >
              背景色
            </FieldLabel>
            <div className="ml-auto flex items-center gap-[9px]">
              <Input
                id="canvas-background-color"
                type="color"
                value={project.canvas.backgroundColor}
                aria-label="画布背景色"
                className="h-6 min-h-0 w-7 min-w-0 cursor-pointer rounded-md border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-moz-color-swatch]:rounded-md [&::-moz-color-swatch]:border [&::-moz-color-swatch]:border-input [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border [&::-webkit-color-swatch]:border-input [&::-webkit-color-swatch-wrapper]:p-0"
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
              <code className="text-[10px] text-muted-foreground">
                {project.canvas.backgroundColor}
              </code>
            </div>
          </Field>
        </FieldGroup>
      </SettingsSection>
      <SettingsSection title="动画节奏" icon={<Gauge />}>
        <FieldSet className="gap-2">
          <FieldLegend variant="label">播放模式</FieldLegend>
          <ToggleGroup
            className="grid w-full grid-cols-3 gap-1 rounded-lg bg-muted p-[3px]"
            value={[project.playback.mode]}
            onValueChange={(values) => {
              const mode = values[0] as PlaybackMode | undefined;
              if (!mode) return;
              setProject((current) => ({
                ...current,
                playback: { ...current.playback, mode },
              }));
            }}
            spacing={0}
          >
            {(["real", "fixed", "total"] as PlaybackMode[]).map((mode) => (
              <ToggleGroupItem
                key={mode}
                value={mode}
                className="rounded-md px-[3px] py-[7px] text-[10px] text-muted-foreground hover:bg-transparent hover:text-foreground aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-[0_1px_3px_color-mix(in_oklab,var(--foreground)_8%,transparent)]"
              >
                {mode === "real"
                  ? "真实速度"
                  : mode === "fixed"
                    ? "固定速度"
                    : "总时长"}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FieldSet>
        <FieldGroup className="mt-[18px]">
          {project.playback.mode === "fixed" && (
            <Field className={sliderFieldLabel}>
              <FieldLabel htmlFor="fixed-speed-slider">
                <span className={cn(sliderValueRow, "mb-[9px]")}>
                  速度 <output>{project.playback.fixedSpeed} px/s</output>
                </span>
              </FieldLabel>
              <Slider
                id="fixed-speed-slider"
                min={100}
                max={1600}
                step={50}
                value={project.playback.fixedSpeed}
                aria-label="固定速度"
                onValueChange={(value) =>
                  setProject((current) => ({
                    ...current,
                    playback: {
                      ...current.playback,
                      fixedSpeed: Number(value),
                    },
                  }))
                }
              />
            </Field>
          )}
          {project.playback.mode === "total" && (
            <Field className={sliderFieldLabel}>
              <FieldLabel htmlFor="total-duration-slider">
                <span className={cn(sliderValueRow, "mb-[9px]")}>
                  总时长{" "}
                  <output>
                    {(project.playback.totalDuration / 1000).toFixed(1)}s
                  </output>
                </span>
              </FieldLabel>
              <Slider
                id="total-duration-slider"
                min={500}
                max={60000}
                step={100}
                value={project.playback.totalDuration}
                aria-label="总时长"
                onValueChange={(value) =>
                  setProject((current) => ({
                    ...current,
                    playback: {
                      ...current.playback,
                      totalDuration: Number(value),
                    },
                  }))
                }
              />
            </Field>
          )}
          <Field className={sliderFieldLabel}>
            <FieldLabel htmlFor="stroke-gap-slider">
              <span className={cn(sliderValueRow, "mb-[9px]")}>
                笔画间隔 <output>{project.playback.strokeGap}ms</output>
              </span>
            </FieldLabel>
            <Slider
              id="stroke-gap-slider"
              min={0}
              max={500}
              step={10}
              value={project.playback.strokeGap}
              aria-label="笔画间隔"
              onValueChange={(value) =>
                setProject((current) => ({
                  ...current,
                  playback: {
                    ...current.playback,
                    strokeGap: Number(value),
                  },
                }))
              }
            />
          </Field>
        </FieldGroup>
        {schedule.warning && (
          <Alert className="mt-3 border-0 bg-muted px-[9px] py-2 text-[10px] leading-[1.4] text-foreground">
            <AlertDescription className="text-foreground">
              {schedule.warning}
            </AlertDescription>
          </Alert>
        )}
      </SettingsSection>
    </div>
  );
}
