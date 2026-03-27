# Project Context

- **Owner:** David
- **Project:** Dave Ball arcade game — bouncing balls in a box, user draws boundary lines to claim territory, fill 80% to win
- **Stack:** Python, Docker, Web (HTML5 Canvas), WebSocket
- **Created:** 2026-03-26

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### Phase 6 — UI Enhancements (2025-06-01)
- Replaced inline script in index.html with proper JS file loading (renderer → input → interpolation → main)
- Removed the old HTML-based `#hud` div; HUD is fully canvas-rendered in renderer.js
- Game screens managed via DOM overlays (start, pause, game over, win) with CSS transitions — not canvas-drawn overlays
- Overlay show/hide uses `.active` class toggling with `opacity` + `pointer-events` transition pattern
- Game state machine: `start_screen` → `playing` ↔ `paused`, and `playing` → `won` | `lost` → back to `playing`
- ESC toggles pause, emits `pause_game` to server; buttons emit `start_game` / `next_level`
- Renderer enhancements: radial gradient balls, pulsing/animated growing lines, fade-in regions, border glow, screen shake on life loss
- HUD shows lives as ♥ hearts, score, fill % as rounded progress bar with 80% goal marker, level number
- `Renderer.setFrameTime()` must be called each frame for animation timing; `Renderer.triggerShake()` for screen shake
- `Renderer.resetRegionFades()` must be called on level transitions to reset fade-in state

### Phase 7 — Ball Speed Setting (2025-07-21)
- Added speed selector (Slow/Normal/Fast) to start screen as a segmented button group between subtitle and play button
- Speed buttons styled as arcade segmented control using `.speed-btn` / `.speed-btn.selected` classes, matching green glow aesthetic
- `initSpeedSelector()` handles toggle behavior; `readSelectedSpeed()` reads selection before emitting events
- Speed mapped to multipliers: slow=0.5, normal=1.0 (default), fast=1.5 via `SPEED_MAP`
- `speed_multiplier` sent with both `start_game` and `next_level` socket events so backend can apply it
- Retry button also reads speed and sends multiplier on `start_game`

### Phase 8 — Sound Effects (2025-07-21)
- Added `frontend/js/sound.js` with `GameSound` global namespace — procedural Web Audio API sounds (no audio files)
- Script load order: renderer → input → interpolation → **sound** → main
- 9 synthesized sounds: lineStart (blip), lineGrowing (continuous hum), lineComplete (chime), lineFailed (buzzer), regionFilled (whoosh), ballBounce (tick), gameWon (arpeggio), gameLost (descending), buttonClick (UI tick)
- Growing line sound is continuous (start/stop pattern) — managed via `hadGrowingLines` flag in game_state handler
- Ball bounce detection: compares velocity sign changes between consecutive server states in `detectBallBounces()`
- AudioContext initialized lazily on first user click/keydown to comply with browser autoplay policies
- Mute button (`#btn-mute`, `.btn-mute`) positioned absolute top-right of game container, z-index 20, toggles 🔊/🔇
- `GameSound.toggleMute()` stops active sounds and zeros master gain; unmute restores to 0.4
- All sound functions are no-ops when muted — safe to call anytime

### Phase 9 — Ball Fission Effects (2025-07-21)
- Added `playBallFission()` to sound.js — white noise burst (80ms) + descending sine tone (900→250Hz), louder than bounce but under line events
- Added fission particle system to renderer.js: `addFissionEffect(x, y)`, `updateParticles(dt)`, `drawParticles(ctx)`
- Particle pool capped at 200; each fission spawns 15-20 particles in a starburst ring pattern with drag
- Colors: white/yellow/orange palette (`FISSION_COLORS`), particles fade + shrink via `life` property
- Flash/glow ring system (`fissionFlashes[]`) — expanding white circle that fades at collision point
- `PLAY_Y_OFFSET` applied to particle/flash y-coords in `addFissionEffect()` so they align with game space
- main.js reads `state.ball_collisions` (array of `{x, y}`) in game_state handler, triggers both visual + audio per collision
- Frame delta (`dt`) computed in gameLoop for particle physics; `updateParticles(dt)` called before clear, `drawParticles(ctx)` drawn above game elements

### Phase 10 — Fire Power-Up Frontend Rendering (2025-07-25)
- Added fire power-up rendering to renderer.js: 🔥 emoji with orange/red pulsing aura, FIRE_COLORS palette
- Fire line rendering: when `line.is_fire` is true, draws orange/red gradient with flickering glow instead of rainbow
- `drawFireTip()` draws fire-colored endpoint dots with warm flicker effect
- `addFireDestroyEffect(x, y)` creates fire burst particles + expanding flame ring + "🔥 BURN!" rising text at burned ball positions
- Fire added to all power-up maps: colorMap, textMap, textColorMap, MYSTERY_SLOT_EMOJIS, MYSTERY_RESOLVED_EMOJI, resolveMysteryText
- `drawDirectionIndicator` now accepts 6th param `fireActive` — shows 🔥 badge + orange glow around cursor
- main.js handles `state.fire_destroy_events` array and passes `state.fire_active` to direction indicator
- Fire capture sound uses `playPowerUpCollect()` as fallback — no dedicated fire sound yet
- index.html How To Play table: fire row added after Nuke row
