# Squad Decisions

## Active Decisions

### Architecture Decision: Dave Ball Game Client-Server Design

**Date:** 2025-06-01  
**Status:** APPROVED  
**Decider:** Ripley (Lead)  
**Stakeholders:** Dallas (Frontend), Ash (Backend), Lambert (Tester)

**Decision:** Authoritative server architecture with Python backend running game logic and physics loop at 30Hz, JavaScript client handling rendering and input only.

**Key Components:**
- Backend: Flask-SocketIO, game loop, physics, territory calculation
- Frontend: Canvas 2D rendering, mouse input, interpolation
- Protocol: WebSocket for state updates and input events

**Rationale:** 
- Meets "Python backend" requirement with substantive game logic
- Prevents cheating and simplifies testing
- Client-side interpolation provides smooth 60fps rendering despite 30Hz server ticks

**Reference:** `.squad/decisions/ripley-game-architecture.md`

---

### Decision: Backend Package Imports & Physics Architecture

**Date:** 2026-03-26  
**Author:** Ash  
**Status:** IMPLEMENTED

**Decision:** Dual-context import pattern for modules to work both as `backend.X` (pytest from project root) and as `X` (Docker `python app.py` from backend/).

**Key Points:**
- `physics.py` is self-contained with no internal backend imports
- `game_state.py` uses `try: from .X` / `except ImportError: from X` for compatibility
- `pythonpath = ["."]` added to `pyproject.toml` for pytest resolution
- `check_wall_collision` accepts both single segment dict and named-walls dict
- Collision uses axis-aligned detection with elastic reflection

**Impact:** All new backend modules should follow this import pattern. Territory module uses this for Ball imports.

---

### Decision: GrowingLine Class with Boundary-Aware Arm Targets

**Date:** 2026-03-26  
**Author:** Ash  
**Status:** IMPLEMENTED

**Decision:** Lines grow as two independent "arms" from click point toward nearest existing boundary in each direction. As player builds more boundaries, new lines only span the remaining gap.

**Key Design Points:**
- `GrowingLine` tracks `arm1_target` and `arm2_target`
- Target finding scans all existing boundaries for nearest perpendicular segment
- Arms marked complete individually with max distance clamping
- `GameState` exposes `territory_recalc_needed` and event flags (`line_completed`, `line_failed`)

**Impact:**
- Frontend receives `GrowingLine.to_dict()` objects with arm completion status
- Phase 5 triggers flood-fill after line completion
- Game loop bounces balls off completed player boundaries

---

### Decision: Fixed test_fill_percentage_known_area Assertion

**Date:** 2026-03-26  
**Author:** Ash  
**Status:** IMPLEMENTED

**Decision:** Lambert's `test_fill_percentage_known_area` in `tests/test_territory.py` had math error. Wall at x=5 in 10-wide grid divides area into left (50 cells, has ball), wall (10 cells), right (40 cells, no ball → filled).

**Correction:** Expected `40/90 * 100 ≈ 44.4%` instead of `50/90 * 100 ≈ 55.6%`.

**Impact:** Test-only change. No production logic affected.

---

### Decision: DOM Overlays for Game Screens

**Date:** 2026-03-26  
**Author:** Dallas  
**Status:** IMPLEMENTED

**Decision:** Game screen overlays (start, pause, game over, win) implemented as **DOM elements with CSS transitions**, not canvas-drawn.

**Rationale:**
- CSS handles opacity, pointer-events, and z-layering cleanly
- DOM buttons get native focus/hover/click behavior
- Canvas continues rendering frozen game scene underneath
- Keeps renderer.js focused on game rendering only

**Impact:**
- Backend events (`game_won`, `game_lost`, `region_filled`) drive transitions via main.js
- All new overlays should follow `.overlay` + `.active` class pattern
- Old canvas-drawn `drawStatusOverlay()` removed

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
