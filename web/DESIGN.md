# Craftly Design System

Source of truth for the Craftly web chat surface (`web/`).  
**Tokens (code):** [`styles/tokens.css`](./styles/tokens.css)  
**Styles:** [`app/globals.css`](./app/globals.css)  
**Components:** [`components/Chat.tsx`](./components/Chat.tsx), [`components/ToolPartView.tsx`](./components/ToolPartView.tsx)

This document describes the visual language already shipped. Prefer changing tokens and this doc together when evolving the UI.

---

## Principles

1. **Long-session calm** — people stare at this for hours; motion stays restrained; no bounce or parallax.
2. **Prose ≠ telemetry** — agent text is unboxed reading; tools are mono “tickets,” never soft chat bubbles.
3. **Same slot, no jank** — tool rows reserve height from first paint; pending morphs into done in place.
4. **Plain language** — buttons and errors say what to do (“Send”, “Cancel”, concrete failure + fix).
5. **One signature** — the left-rail morph on tool tickets is the memorable element; don’t dilute it with extra chrome.

---

## Color — “Workshop graphite”

Dark on purpose: long sessions with dense mono tool output. Warm near-black, not cold blue-black AI chrome. Avoid cream+terracotta, neon-on-black, and purple gradients.

| Token | Hex | Use |
|-------|-----|-----|
| `--ink-bg` | `#141210` | Page field |
| `--panel` | `#1e1c18` | Composer shell, elevated strips |
| `--panel-2` | `#26231e` | Secondary elevated surface |
| `--ticket` | `#2a2722` | Tool ticket fill |
| `--ticket-line` | `#3f3a32` | Tool ticket border |
| `--ink` | `#ebe6da` | Primary text, wordmark |
| `--muted` | `#8a8376` | Labels, hints, secondary |
| `--brass` | `#b8954a` | Live affordances: Send, focus, running rail/verb, brand rule, user quote rail, streaming caret |
| `--brass-dim` | `#8a7038` | Softer brass (composer focus border, running status) |
| `--sage` | `#6f8f78` | Tool done / success |
| `--fault` | `#c17a6a` | Cancel, errors, cancelled/failed tickets |
| `--line` | `#34302a` | Dividers, default borders |
| `--focus` | `#b8954a` | `:focus-visible` outline (same as brass) |

Body background uses a short warm gradient into `--ink-bg` (see `globals.css`).

---

## Typography

| Role | Family | Token | Where |
|------|--------|-------|--------|
| Display | **Fraunces** | `--display` | Craftly wordmark only |
| Body | **Figtree** | `--sans` | Prose, composer, buttons |
| Mono | **IBM Plex Mono** | `--mono` | Tools, status pill, turn labels, composer hint |

- Reading measure: `--measure` ≈ `40rem` on turn bodies.
- Shell max width: `44rem`.
- Wordmark: Fraunces 600, clamp ~1.5–1.85rem, brass underline (`.brand-rule`).

---

## Layout

```
┌──────────────────────────────────────────┐
│ Craftly                      idle|working│  Fraunces + brass rule · mono status
├──────────────────────────────────────────┤
│                                          │
│  YOU                                     │  mono label
│  │ Find TODOs under packages/            │  brass quote rail — not a bubble
│                                          │
│  AGENT                                   │
│  I'll search the repo first.             │  flush Figtree prose — no card
│                                          │
│  ┃ grep  TODO  packages/                 │  tool ticket (mono + left rail)
│  ┃ ··· running  →  12 matches            │  rail morph in the same slot
│                                          │
│  Twelve hits, mostly in cli/…            │  prose continues
│                                          │
├──────────────────────────────────────────┤
│  Ask about a file, a bug, or a change…   │  docked composer (--panel)
│  Enter to send · Shift+Enter    [ Send ] │
└──────────────────────────────────────────┘
```

**Instant distinction**

| Kind | Look |
|------|------|
| User | Brass left hairline, no fill box |
| Agent prose | Unboxed Figtree, `--measure` width |
| Tool | Flat ticket, `--mono`, 4px status rail, reserved `--tool-min-h` |

---

## Components

### Shell / masthead / transcript / composer — `Chat.tsx`

| Class | Role |
|-------|------|
| `.shell` | Centered column, full viewport height |
| `.header` / `.brand` / `.brand-rule` | Craftly wordmark |
| `.status-pill` | `idle` / `working` (`data-live`) |
| `.transcript` | Scrollable timeline (`role="log"`) |
| `.empty` / `.empty-hint` | First-run guidance |
| `.turn` / `.turn-user` / `.turn-agent` | Message blocks |
| `.turn-label` | `YOU` / `AGENT` |
| `.text-part` / `.is-streaming` / `.is-error` | Assistant text + caret / errors |
| `.composer` / `.composer-box` / `.composer-bar` | Input dock |
| `.btn` / `.btn-send` / `.btn-cancel` | Actions |

### Tool ticket — `ToolPartView.tsx` (signature)

| Class / attr | Role |
|--------------|------|
| `.tool-ticket` | Grid: rail + main; `data-status`: `running` \| `done` \| `cancelled` \| `error` |
| `.tool-rail` | 4px status strip; shimmer when running |
| `.tool-verb` / `.tool-args` / `.tool-status` | Name, summary args, status/result |

**Rail morph**

1. **Pending:** brass rail + vertical shimmer; status text pulses `running`. No circular spinner.
2. **Done (~220ms via `--ease`):** rail → sage; verb/status → sage; status becomes result summary (`20 lines`, `exit 0`).
3. **Cancelled / error:** rail + verb + status → fault; cancelled tickets dim slightly.
4. **Anti-jank:** `min-height: var(--tool-min-h)` from mount; mutate status in place (stable `toolCallId` key).

---

## Motion

| Token / rule | Value |
|--------------|--------|
| `--ease` | `0.22s ease` — color/opacity transitions on rail, verb, status, buttons |
| Rail shimmer | `1.6s` linear infinite (running only) |
| Status pulse | `1.5s` ease-in-out (running only) |
| Caret blink | `1s` steps (streaming text) |
| Status pill dot | `1.4s` when `working` |

**`prefers-reduced-motion: reduce`:** disable shimmer, pulse, caret, live-dot animations; remove transitions on rail/verb/status/buttons; transcript scroll becomes `auto`.

Do not add bounce, springy entrances, or parallax.

---

## Accessibility

- Global `:focus-visible` — 2px `--focus` outline, 3px offset.
- Composer focus ring via `.composer-box:focus-within` (brass-dim border + soft glow).
- Tool tickets: `role="status"`, `aria-live="polite"` while running.
- Transcript: `aria-live="polite"` / `aria-relevant="additions"`.
- Keyboard: **Enter** send, **Shift+Enter** newline; labels on textarea (`Message`) and buttons.

---

## Copy voice

- Buttons: **Send**, **Cancel** — not Submit / Stop generating.
- Empty: active invitation (“Ask the agent to dig into this repo”) + one concrete example.
- Errors: what failed + how to fix (e.g. check `OPENAI_API_KEY`, confirm `pnpm web` is running).
- Status: lowercase mono `idle` / `working`.
- Tool status: `running` → result summary / `stopped` / `failed`.

---

## Do / Don’t

**Do**

- Extend via tokens in `styles/tokens.css` first.
- Keep tools as rail tickets; keep prose unboxed.
- Preserve reserved tool height and in-place status morph.
- Gate new motion behind `prefers-reduced-motion`.

**Don’t**

- Soft ChatGPT-style bubbles for agent or tools.
- Generic circular spinners for tool pending state.
- Cream + terracotta, neon accents, purple gradient themes.
- Marketing motion (bounce, parallax, confetti).
- Put web-only branding into CLI / core packages (Craftly is the web surface name).

---

## File map

| Path | Responsibility |
|------|----------------|
| [`styles/tokens.css`](./styles/tokens.css) | Fonts import + CSS variables |
| [`app/globals.css`](./app/globals.css) | Component styles + motion |
| [`components/Chat.tsx`](./components/Chat.tsx) | Timeline, composer, streaming UX |
| [`components/ToolPartView.tsx`](./components/ToolPartView.tsx) | Tool ticket UI |
| [`app/layout.tsx`](./app/layout.tsx) | Document title “Craftly” |
| [`app/api/chat/`](./app/api/chat/) | SSE route (presentation-agnostic) |
