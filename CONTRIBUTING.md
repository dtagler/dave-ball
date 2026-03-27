# Contributing to Dave Ball

Thanks for your interest in contributing! This guide covers development setup, testing, and code standards.

## Development Environment

### Prerequisites

- Python 3.11 or later
- Docker & Docker Compose (for containerized development)
- Git
- A text editor (VS Code, PyCharm, etc.)

### Quick Setup

1. **Clone the repo:**
   ```bash
   git clone <repo-url>
   cd dave-ball
   ```

2. **Start with Docker Compose:**
   ```bash
   docker-compose up
   ```
   
   Backend runs on `http://localhost:5000`, frontend on `http://localhost:8080`.

3. **Or set up manually:**

   **Backend:**
   ```bash
   cd backend
   pip install -r requirements.txt
   export FLASK_ENV=development FLASK_DEBUG=1
   python app.py
   ```

   **Frontend:**
   ```bash
   cd frontend
   # Use any static file server; e.g., Python's built-in:
   python -m http.server 8080
   ```

## Running Tests

```bash
python -m pytest tests/ -v
```

This runs:
- **test_physics.py** – Ball collision detection and velocity calculations
- **test_territory.py** – Grid flood-fill and region detection
- **test_powerups.py** – Power-up spawning, capture, and effects
- **test_gameplay.py** – End-to-end game flow scenarios

Aim for >70% code coverage on physics and territory logic.

## Code Style

### Python (Backend)

- **Type hints:** All functions and methods must have type hints (PEP 484).
  ```python
  def check_wall_collision(ball: Ball, boundary: dict) -> bool:
  ```
- **Formatting:** Follow PEP 8. Use a linter like `flake8` or `black` for consistency.
- **Comments:** Comment only non-obvious logic. Self-documenting code is preferred.
- **Testing:** Write unit tests for physics and territory algorithms. Aim for clear, focused test cases.

### JavaScript (Frontend)

- **No build tools:** Frontend uses vanilla JavaScript with no bundler or transpiler.
- **Modules:** Use the IIFE module pattern with `DaveBall` global namespace (e.g., `DaveBall.Renderer`). Exception: `sound.js` uses its own `GameSound` namespace. Don't rely on `import`/`export` (ES6 modules).
- **Comments:** Minimal; write clear function names and structure.
- **Canvas API:** Keep rendering functions pure and separate from state management.

## Project Structure

```
backend/
  ├── app.py              # Flask + SocketIO server, game loop
  ├── config.py           # Constants (ball speed, line growth, grid size)
  ├── game_state.py       # GameState, GrowingLine classes
  ├── physics.py          # Ball, collision detection
  └── territory.py        # Grid, flood-fill, region detection

frontend/
  ├── index.html          # Main page
  ├── css/styles.css      # Game styling and overlays
  └── js/
      ├── main.js         # Entry point, Socket.IO connection, 60Hz render loop
      ├── renderer.js     # Canvas drawing (balls, boundaries, filled regions, effects)
      ├── input.js        # Mouse event handlers
      ├── interpolation.js # Ball position smoothing between server updates
      └── sound.js        # Procedural audio via Web Audio API

tests/
  ├── test_physics.py     # Ball motion, collisions
  ├── test_territory.py   # Flood-fill, region detection
  └── e2e/test_gameplay.py # Full game scenarios
```

## Key Algorithms

### Line-Ball Collision
Detect if a growing line segment hits a ball using point-to-segment distance. See `physics.py:check_line_ball_collision()`.

### Flood-Fill Region Detection
After a line completes, use BFS to identify connected regions. Mark regions without balls as "enclosed" for filling. See `territory.py:find_enclosed_regions()`.

### Line Growth Mechanics
Lines grow in one direction (vertical or horizontal) at a fixed speed. Check for collisions each tick. Reach the boundary to complete the line. See `game_state.py:GrowingLine`.

## Architecture Decisions

1. **Server Authority:** All game state lives on the server. Clients send input; server broadcasts state via WebSocket (SocketIO).
2. **Client Interpolation:** Server updates at 30Hz; client renders at 60Hz by interpolating ball positions.
3. **Stateless Frontend:** Frontend has no game logic—it renders and captures input.
4. **Docker:** Single `docker-compose.yml` for local dev and (extensible to) production.

## Before Submitting a Pull Request

- [ ] All tests pass: `pytest tests/ -v`
- [ ] Code follows PEP 8 (Python) and conventions (JavaScript)
- [ ] Type hints added to all Python functions
- [ ] New code has test coverage (aim for >70%)
- [ ] Comments explain non-obvious logic only
- [ ] No breaking changes to the WebSocket API (or clearly documented)

## Questions?

Open an issue or discussion in the repo. Happy coding!
