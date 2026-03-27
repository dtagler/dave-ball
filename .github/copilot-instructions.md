# Copilot Instructions for Dave Ball

## Build & Run

```bash
# Start everything (backend + frontend) via Docker
docker-compose up --build -d

# Frontend: http://localhost:8080  |  Backend: http://localhost:5000
```

Manual (no Docker):
```bash
# Backend
cd backend && pip install -r requirements.txt && python app.py

# Frontend (any static server)
cd frontend && python -m http.server 8080
```

## Tests

```bash
# Full suite (run from repo root)
python -m pytest tests/ -v

# Single test file
python -m pytest tests/test_physics.py -v

# Single test by name
python -m pytest tests/test_physics.py -k "test_ball_wall_bounce" -v

# By marker
python -m pytest -m physics -v
```

Available markers: `physics`, `territory`, `line_growth`, `slow`.

Tests import from `backend.*` (e.g., `from backend.game_state import GameState`). The repo root is on `pythonpath` via `pyproject.toml`.

## Architecture

**Server-authoritative model:** All game logic runs on the Python backend at 30Hz. The frontend is a pure renderer — no game logic, no state mutations. Communication is bidirectional WebSocket via Flask-SocketIO (eventlet async mode).

**Data flow:**
1. Client sends input events (`start_line`, `toggle_direction`) via Socket.IO
2. Server's `game_state.py` processes physics, collisions, territory, and power-ups each tick
3. Server broadcasts the full `game_state` dict to all clients at 30Hz
4. Client interpolates ball positions between server frames for 60fps rendering

**Key backend modules:**
- `game_state.py` — Core game engine (~2000+ lines). `GameState` class owns all state: balls, lines, territory grid, power-ups, scoring. This is the most complex file.
- `physics.py` — `Ball` class, wall/line/ball-ball collision detection. `check_wall_collision` must verify segment **span** (not just axis position).
- `territory.py` — BFS flood fill on a 2D grid to detect enclosed regions after line completion.
- `config.py` — All tunable constants. Change game balance here, not in game_state.py.

**Frontend modules (vanilla JS, no bundler):**
- Uses the `DaveBall` global namespace pattern: `DaveBall.Renderer`, `DaveBall.Input`, `DaveBall.Main`
- Exception: `sound.js` uses its own `GameSound` global namespace
- Script load order matters (set in `index.html`): `renderer.js` → `input.js` → `interpolation.js` → `sound.js` → `main.js`

## Key Conventions

**Python style:** Type hints on all functions (PEP 484). Imports use relative form inside `game_state.py` (try/except for `from .physics` vs `from physics` to support both direct and package imports).

**Frontend pattern:** All JS modules use the IIFE module pattern (`DaveBall.X = (function() { ... })()`) returning a public API object. No ES6 import/export. Every public function a module exposes must be included in the return object — a missing export silently breaks callers.

**Power-up capture mechanic:** Power-ups aren't clicked — they're captured when a completed line encloses them in a filled region. The backend handles this in `check_powerup_captures()`.

**State key naming:** The backend sends `state` (not `status`) in `to_dict()`. The frontend must read `state.state` for game status. Using `state.status` is a recurring bug source.

**Docker rebuild required:** After any backend or frontend code change, run `docker-compose up --build -d` — the containers copy source at build time, not via live mounts in the default config.

## Common Pitfalls

- **🔴 LINE DRAWING REGRESSION (recurring!):** Left-click to draw lines has broken MULTIPLE times after code changes. This is the game's core mechanic. **After ANY code change**, verify line drawing still works by checking: (1) `input.js` dispatches `line-start` CustomEvent on left-click, (2) `main.js` has `canvas.addEventListener('line-start', onLineStart)` in init, (3) `onLineStart` emits `socket.emit('line_start', ...)`, (4) `app.py` has `@socketio.on("line_start")` handler, (5) `game_state.start_line()` is called and returns True. **Known root causes that have broken this:**
  - **Missing IIFE export:** `PLAY_WIDTH` was removed from `renderer.js` return object. `input.js` uses `R.PLAY_WIDTH` in `isInPlayArea()` — when undefined, the comparison `pos.x <= undefined` is always false, silently rejecting ALL clicks. **RULE: Never remove properties from a module's return object. Every public property/function must stay in the return block.**
  - **Browser caching stale JS:** Nginx was serving cached old JS files. Fixed by adding `Cache-Control: no-cache` headers for `.js` and `.css` files. **RULE: Always tell user to hard-refresh (Ctrl+Shift+R) after deploying frontend changes.**
  - **Bad SRI hash on CDN script:** Adding an incorrect `integrity` attribute to the Socket.IO CDN `<script>` tag causes the browser to refuse loading it entirely. No socket = no connection = clicks silently fail. **RULE: Don't add SRI hashes without verifying them.**
  - **Pause/unpause event mismatch:** Frontend sent `pause_game` for both pause AND unpause, but backend had separate `pause_game`/`unpause_game` handlers. After pausing, the game stayed paused on the server, and `handle_line_start` rejected all input because `state != "playing"`. **RULE: Frontend event names must match backend handler names exactly.**
  - **`clearWinTimers` scope:** Defined inside `connectSocket()` but called from `initButtons()` — JS ReferenceError killed the handler silently.
  - **Docker container running stale code:** Containers copy source at build time. Code changes on disk don't take effect until `docker-compose up --build -d`.
- **🔴 IIFE return object is sacred:** The `renderer.js`, `main.js`, and `input.js` modules use the IIFE pattern. The `return { ... }` block at the end of each IIFE defines the public API. **If a property is removed from the return object, any other module referencing it gets `undefined` with NO error.** This is the #1 cause of silent breakage. After ANY edit to these files, verify the return object still exports everything that `input.js`, `main.js`, and `index.html` reference.
- **`check_wall_collision` span check:** Ball-wall collision must verify the ball is within the wall segment's y-range (vertical) or x-range (horizontal), not just near the axis. Missing this causes balls bouncing off invisible walls.
- **Power-up event clearing:** Power-up events must not be cleared from game state until **after** the `game_state` broadcast, or the frontend never sees them.
- **Game loop guard:** `game_loop_running` flag uses try/finally. If the loop crashes without finally, the flag stays True and `next_level` can never restart it.
- **Win animation timers:** `setTimeout` IDs for win celebration must be tracked and cancelled when "Next Level" is clicked, otherwise stale callbacks fire and show duplicate popups.
- **`id(ball)` stale references:** Python reuses memory addresses. When a ball is removed (fire/acid/snake/nuke/bomb), call `_cleanup_ball_refs(ball)` to clear it from `_ball_original_speeds`, `ball_web_timers`, `ball_portal_cooldowns`, and other tracking dicts.
- **Docker rebuild required:** After ANY backend or frontend code change, run `docker-compose up --build -d`. Containers copy source at build time, not via live mounts. Use `--no-cache` if the build layer is stale.

## Azure Deployment

**Hosted on Azure Container Apps** (East US). Resource group: `rg-dave-ball`.

**Dev machine is ARM64** — cannot build linux/amd64 Docker images locally. Use ACR cloud builds instead:

```bash
# Get resource names from azd environment
azd env get-values

# Rebuild & redeploy backend
az acr build --registry <ACR_NAME> --image backend:latest --platform linux/amd64 --file backend/Dockerfile.prod backend/
az containerapp update --name <BACKEND_APP_NAME> -g rg-dave-ball --image <ACR_NAME>.azurecr.io/backend:latest

# Rebuild & redeploy frontend
az acr build --registry <ACR_NAME> --image frontend:latest --platform linux/amd64 --file frontend/Dockerfile.aca frontend/
az containerapp update --name <FRONTEND_APP_NAME> -g rg-dave-ball --image <ACR_NAME>.azurecr.io/frontend:latest
```

**Infrastructure changes:** `azd provision` (reads `infra/main.bicep`). Do NOT use `azd up` — it tries to build Docker locally which fails on ARM64.

**Live URL:** Check `azd env get-values` for `FRONTEND_URL`.
