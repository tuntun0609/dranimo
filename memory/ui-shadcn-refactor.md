---
name: ui-shadcn-refactor
description: Ongoing task — refactor all UI to shadcn conventions without changing functionality
metadata:
  type: project
---

Task (started 2026-07-17): 重构全部 UI 遵从 shadcn 规范，功能不变.

The app (dranimo, a hand-drawn animation editor) already uses Base-UI-flavored shadcn primitives in `src/components/ui/`, but `DranimoEditor.tsx`, `ProjectSwitcher.tsx`, `SettingsPanelContent.tsx` still rely on ~1200 lines of bespoke semantic CSS classes in `src/app/globals.css` plus legacy color aliases (`--ink`/`--cream`/`--paper`/`--mint`/`--coral`/`--line`/`--shadow`).

Approach: convert bespoke CSS → colocated Tailwind utilities with semantic tokens (foreground/muted/card/sidebar/accent/primary/border/input/ring), keep all logic/handlers/props byte-identical, then reduce globals.css to tokens + base only. Breakpoints use arbitrary `max-[980px]:` / `max-[640px]:` to match the original media queries exactly (not Tailwind's `lg`/`sm`). Native color inputs use `[&::-webkit-color-swatch]` arbitrary variants instead of global CSS. A few `color-mix(...)` / `--shadow` values kept as arbitrary `bg-[...]`/`shadow-[...]` values since there's no token for them.

DONE (2026-07-17): all three components converted; globals.css cut 1196→131 lines (kept tokens, base reset, `--shadow`). `bun run build` clean (TS passes), `biome check` clean, `bun test` 14/14 pass. Slider track/range/thumb overrides live as `[&_[data-slot=slider-*]]` arbitrary variants on the timeline Slider. No behavior/handlers changed.

TWO GOTCHAS found + fixed after the refactor:
1. `@base-ui` Toggle / ToggleGroupItem emit `data-pressed` + `aria-pressed` — NEVER `data-state="on"`. To style the selected toggle, use the `aria-pressed:` variant (shadcn's own toggle.tsx base variant uses `aria-pressed:bg-muted`). Custom `data-[state=on]:` classes silently never match. When overriding the base `aria-pressed:bg-muted`, put your `aria-pressed:bg-*` last in the className string so tailwind-merge wins.
2. Tailwind v4 defaults bare `border`/`border-t`/`border-l` to `currentColor` (renders black). shadcn components (DialogFooter/CardFooter `border-t`, SheetContent `border-l`) rely on the standard base rule `@layer base { * { border-color: var(--border) } }` — must keep it in globals.css. Removing it during a globals.css trim causes stray black lines.
