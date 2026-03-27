# Project Context

- **Owner:** David
- **Project:** Dave Ball arcade game — bouncing balls in a box, user draws boundary lines to claim territory, fill 80% to win
- **Stack:** Python, Docker, Web (HTML5 Canvas), WebSocket
- **Created:** 2026-03-26

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
- Use `uv run python -m pytest` to run tests (no bare `python` on this machine).
- GameState._init_balls() creates random balls; for deterministic tests, create with `num_balls=0` then manually append Ball objects to `gs.balls`.
- BALL_RADIUS=8 means balls need at least 8px clearance from lines and walls — in small play areas (100x100) this severely limits where balls and lines can coexist without collision.
- Ball velocity during tick simulation can drift balls across regions; use stationary balls (vx=0, vy=0) when testing territory isolation to avoid non-determinism.
- The game tick loop order matters: move balls → check line-ball collisions → grow lines → recalculate territory. This matches the authoritative server loop.
- 76 total tests now: test_physics (11), test_territory (8), test_line_growth (19), test_gameplay (26). All passing.
- 234 total tests after power-up/snake/scoring/obstacle coverage push: test_powerups (56), test_snake (14), test_scoring (24), test_obstacles (17) added. All passing.
- Power-up effects are applied via `_apply_powerup_effect(kind, event)` — test each kind individually with a controlled GameState.
- `_make_game()` helper with `_clear_obstacles()` is essential for deterministic tests — obstacles spawn randomly otherwise.
- Snake, Magnet, Sinkhole are max-1-at-a-time entities — spawning a new one replaces the old.
- `check_powerup_captures()` processes both `self.powerups` and `self.fruits` lists separately.
- `calculate_level_score()` adds the total to `self.score` in-place — assert cumulative values.
- `next_level()` preserves score but resets all power-up state, timers, and entities.
- Grow cancels shrink and vice versa — "latest effect wins" pattern.
- Lightning charges raw-add (+3 per pickup) with no cap in `_apply_powerup_effect`; consumption happens in `complete_line` / `fail_line`.
- 277 total tests after coverage gap audit: test_fire_acid_coverage (43) added covering fire, acid, magnet sticking, lightning fail_line, snake active-area spawn, GameState.to_dict() completeness, and GrowingLine.is_fire serialization.
- Fire power-up has NO last-ball guard — fire line CAN destroy all balls (documented in test).
- Acid power-up DOES have a last-ball guard (`len(self.balls) - len(destroyed) > 1`).
- Snake class has no `.x`/`.y` — head position is `segments[0]["x"]` and `segments[0]["y"]`.
- Lightning charges have no max cap in the implementation — `_apply_powerup_effect` does raw `+= 3`.
