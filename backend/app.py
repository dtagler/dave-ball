"""Flask-SocketIO server for Dave Ball arcade game."""

import logging
import math
import os
import time
from flask import Flask
from flask_socketio import SocketIO, emit

from config import BACKEND_HOST, BACKEND_PORT, CORS_ORIGINS, TICK_RATE, MAX_HIGH_SCORES, HIGH_SCORE_FILE, POWERUP_SPAWN_CHANCE, WAVE_AMPLITUDE, WAVE_FREQUENCY, BALL_SPEED, PLAY_AREA_WIDTH, PLAY_AREA_HEIGHT
from game_state import GameState
from highscores import HighScoreManager
from physics import update_ball_position, check_line_ball_collision

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", os.urandom(24).hex())

socketio = SocketIO(
    app,
    cors_allowed_origins=CORS_ORIGINS,
    async_mode="eventlet",
    logger=False,
    engineio_logger=False,
)


# ---------------------------------------------------------------------------
# Game state (single-room for now)
# ---------------------------------------------------------------------------
game_state: GameState | None = None
game_loop_running: bool = False
high_score_manager = HighScoreManager(
    filepath=os.path.join(os.path.dirname(__file__), HIGH_SCORE_FILE),
    max_entries=MAX_HIGH_SCORES,
)


@app.route("/health")
def health():
    """Health check endpoint."""
    return {"status": "ok"}


@socketio.on("connect")
def handle_connect():
    """Handle new client WebSocket connection."""
    logger.info("Client connected")
    emit("connected", {"message": "Connected to server"})


@socketio.on("disconnect")
def handle_disconnect(*args):
    """Handle client WebSocket disconnection."""
    logger.info("Client disconnected")


@socketio.on("ping_server")
def handle_ping(data):
    """Echo back a ping for connection testing."""
    emit("pong_server", {"message": "pong", "received": data})


@socketio.on("start_game")
def handle_start_game(data=None):
    """Initialise a new game and start the server-side tick loop.

    Also handles 'next level' by accepting continue_level and continue_score
    parameters — this creates a fresh GameState at the specified level,
    bypassing the fragile next_level state transition entirely.
    """
    global game_state, game_loop_running
    speed_multiplier = 1.0
    continue_level = None
    continue_score = 0
    if isinstance(data, dict):
        try:
            sm = float(data.get("speed_multiplier", 1.0))
        except (TypeError, ValueError):
            sm = 1.0
        speed_multiplier = sm if math.isfinite(sm) else 1.0
        speed_multiplier = max(0.5, min(3.0, speed_multiplier))
        continue_level = data.get("continue_level")
        try:
            continue_score = int(data.get("continue_score", 0))
        except (TypeError, ValueError):
            continue_score = 0
    # Wait for any old game loop to exit
    for _ in range(50):
        if not game_loop_running:
            break
        socketio.sleep(0.05)
    game_loop_running = False  # force-clear in case wait timed out

    if continue_level is not None:
        # Next Level: create fresh state at the specified level
        try:
            level = int(continue_level)
        except (TypeError, ValueError):
            level = 1
        num_balls = level + 1
        game_state = GameState(
            num_balls=num_balls,
            speed_multiplier=speed_multiplier,
        )
        game_state.level = level
        game_state.score = continue_score
        game_state.lives = num_balls + 1
        # Re-init obstacles and balls at the correct level
        game_state._clear_obstacles()
        game_state._init_obstacles()
        ball_speed = BALL_SPEED * speed_multiplier * (1.1 ** (level - 1))
        game_state.balls.clear()
        game_state._init_balls(num_balls, speed=ball_speed)
        logger.info("Next level %d started (score=%d, speed=%.1f)",
                     level, continue_score, speed_multiplier)
    else:
        game_state = GameState(speed_multiplier=speed_multiplier)
        logger.info("Game started (speed_multiplier=%.1f)", speed_multiplier)

    game_state.state = "playing"
    game_state.spawn_powerup()  # spawn one power-up at game start
    game_state._maybe_spawn_jackpot()  # roll for rare jackpot
    socketio.start_background_task(game_loop)
    emit("game_state", game_state.to_dict())


@socketio.on("get_high_scores")
def handle_get_high_scores(data=None):
    """Return the current leaderboard."""
    emit("high_scores", {"scores": high_score_manager.get_scores()})


@socketio.on("submit_score")
def handle_submit_score(data):
    """Add a score to the leaderboard if it qualifies."""
    if not isinstance(data, dict):
        return
    initials = data.get("initials", "")
    if not isinstance(initials, str) or not initials.isalpha() or not (2 <= len(initials) <= 3):
        logger.warning("submit_score rejected: invalid initials %r", initials)
        return
    initials = initials.upper()
    try:
        score = int(data.get("score", 0))
        level = int(data.get("level", 1))
    except (TypeError, ValueError):
        logger.warning("submit_score rejected: non-integer score/level")
        return
    if score < 0 or level < 1:
        logger.warning("submit_score rejected: score=%d, level=%d", score, level)
        return
    rank = high_score_manager.add_score(initials, score, level)
    emit("score_submitted", {
        "rank": rank,
        "scores": high_score_manager.get_scores(),
    })


@socketio.on("line_start")
def handle_line_start(data):
    """Client clicked to start growing a boundary line."""
    if not isinstance(data, dict):
        return
    if game_state is None or game_state.state != "playing":
        return
    try:
        x = float(data.get("x", 0))
        y = float(data.get("y", 0))
    except (TypeError, ValueError):
        return
    if not (math.isfinite(x) and math.isfinite(y)):
        return
    x = max(0.0, min(x, float(PLAY_AREA_WIDTH)))
    y = max(0.0, min(y, float(PLAY_AREA_HEIGHT)))
    game_state.start_line(
        x=x,
        y=y,
        direction=data.get("direction", "horizontal"),
    )


# Pause is intentionally client-only (single-player, no server tick needed while
# paused).  These handlers let the client signal pause/unpause so the server
# stops broadcasting state updates and the game loop can idle.

@socketio.on("pause_game")
def handle_pause_game(data=None):
    """Pause the game — stop the server game loop."""
    global game_loop_running
    if game_state is None or game_state.state != "playing":
        return
    game_state.state = "paused"
    game_loop_running = False
    logger.info("Game paused")
    emit("game_state", game_state.to_dict())


@socketio.on("unpause_game")
def handle_unpause_game(data=None):
    """Resume the game after a pause."""
    if game_state is None or game_state.state != "paused":
        return
    game_state.state = "playing"
    socketio.start_background_task(game_loop)
    logger.info("Game unpaused")
    emit("game_state", game_state.to_dict())


@socketio.on("next_level")
def handle_next_level(data=None):
    """Advance to the next level after winning."""
    global game_state, game_loop_running
    if game_state is None:
        logger.warning("next_level rejected: game_state is None")
        return
    # Allow next_level if won, or if playing but game loop died (stuck state recovery)
    if game_state.state != "won" and not (game_state.state == "playing" and not game_loop_running):
        logger.warning("next_level rejected: state=%s, game_loop_running=%s",
                       game_state.state, game_loop_running)
        return
    if isinstance(data, dict) and "speed_multiplier" in data:
        try:
            sm = float(data["speed_multiplier"])
        except (TypeError, ValueError):
            sm = game_state.speed_multiplier
        if not math.isfinite(sm):
            sm = game_state.speed_multiplier
        game_state.speed_multiplier = max(0.5, min(3.0, sm))
    # Wait for old game loop to exit
    for _ in range(50):
        if not game_loop_running:
            break
        socketio.sleep(0.05)
    # Force-clear the flag in case the wait timed out (prevents new loop from
    # returning immediately due to the `if game_loop_running: return` guard).
    game_loop_running = False
    game_state.next_level()
    logger.info("Level %d started", game_state.level)
    socketio.start_background_task(game_loop)
    emit("game_state", game_state.to_dict())


# ---------------------------------------------------------------------------
# 30 Hz server tick
# ---------------------------------------------------------------------------

def game_loop():
    """Background task: update physics and broadcast state at TICK_RATE Hz."""
    global game_loop_running
    if game_loop_running:
        return  # prevent duplicate loops
    game_loop_running = True
    dt = 1.0 / TICK_RATE
    try:
        while game_state is not None and game_state.state == "playing":
            tick_start = time.monotonic()

            # Increment tick counter
            game_state.tick_count += 1

            # 0. Decrement fission cooldowns
            for ball in game_state.balls:
                ball.fission_cooldown = max(0.0, ball.fission_cooldown - dt)

            # 0b. Update slow effect timer
            game_state.update_slow_effect(dt)

            # 0c. Update freeze and shrink effect timers
            game_state.update_freeze_effect(dt)
            game_state.update_shrink_effect(dt)
            game_state.update_grow_effect(dt)
            game_state.update_fusion_effect(dt)
            game_state.update_fission_pu_effect(dt)
            game_state.update_wave_effect(dt)
            game_state.update_web_zones(dt)
            game_state.update_portals(dt)
            game_state.update_sinkhole(dt)
            game_state.update_magnet(dt)
            game_state.update_snake(dt)
            game_state.update_acid_pools(dt)

            # 1. Update ball positions (sub-stepped to prevent tunneling)
            #    Skip entirely when freeze is active
            if not game_state.is_frozen and not game_state.anchor_active:
                for ball in game_state.balls:
                    update_ball_position(ball, dt, game_state.boundaries)

            # 1b. Wave effect: add perpendicular sine offset to ball positions
            if game_state.is_wave:
                for idx, ball in enumerate(game_state.balls):
                    offset = math.sin(game_state.wave_elapsed * WAVE_FREQUENCY + idx) * WAVE_AMPLITUDE
                    # Perpendicular to velocity: use normalized (-vy, vx) direction
                    speed = math.sqrt(ball.vx ** 2 + ball.vy ** 2)
                    if speed > 0:
                        perp_x = -ball.vy / speed
                        perp_y = ball.vx / speed
                        ball.x += perp_x * offset * dt
                        ball.y += perp_y * offset * dt

            # 2. Ball-ball collisions and fission
            game_state.check_ball_collisions()
            # Clamp balls after collision separation may have pushed them OOB
            for ball in game_state.balls:
                game_state._clamp_ball_to_play_area(ball)

            # 3. Grow active lines
            game_state.grow_lines(dt)

            # 3b. Update level timer
            game_state.update_timer(dt)

            # 4. Check line-ball collisions on remaining growing lines
            #    Shield: skip collision check entirely — line is indestructible
            #    Fire lines: destroy the ball instead of failing the line
            if not game_state.shield_active:
                for line in list(game_state.growing_lines):
                    if not line.active:
                        continue
                    segments = line.get_segments()
                    if line.is_fire:
                        # Fire line: destroy any balls that touch it
                        for seg in segments:
                            for ball in list(game_state.balls):
                                if len(game_state.balls) <= 1:
                                    break
                                if check_line_ball_collision(seg, ball):
                                    game_state.fire_destroy_events.append(
                                        {"x": ball.x, "y": ball.y,
                                         "ball_id": id(ball)})
                                    game_state._cleanup_ball_refs(ball)
                                    game_state.balls.remove(ball)
                    else:
                        hit = False
                        for seg in segments:
                            for ball in game_state.balls:
                                if check_line_ball_collision(seg, ball):
                                    hit = True
                                    break
                            if hit:
                                break
                        if hit:
                            game_state.fail_line(line)
                            socketio.emit("line_failed", {"lives": game_state.lives})

            # 5. Consume event flags
            if game_state.line_completed:
                game_state.line_completed = False
                socketio.emit("line_completed", {})

            # 6. Territory recalculation (Phase 5)
            if game_state.territory_recalc_needed:
                game_state.recalculate_territory()
                game_state.check_powerup_captures()
                socketio.emit("region_filled", {
                    "fill_percentage": game_state.fill_percentage,
                    "filled_regions": game_state.filled_regions,
                })
                # Emit power-up capture events
                if game_state.powerup_events:
                    socketio.emit("powerup_captured", {"events": list(game_state.powerup_events)})
                if game_state.state == "won":
                    score_breakdown = game_state.calculate_level_score()
                    socketio.emit("game_won", {
                        "fill_percentage": game_state.fill_percentage,
                        "score": game_state.score,
                        "score_breakdown": score_breakdown,
                    })
                    # NO check_high_score here — player continues to next level
                    # High score is only checked on game over (death)

            if game_state.line_failed:
                game_state.line_failed = False
                if game_state.state == "lost":
                    socketio.emit("game_lost", {"lives": 0, "score": game_state.score})
                    socketio.emit("check_high_score", {
                        "is_high_score": high_score_manager.is_high_score(game_state.score),
                        "score": game_state.score,
                    })

            # Safety: fix any ball with NaN/Infinity or out-of-bounds position
            game_state._sanitize_balls()

            # 7. Broadcast state
            socketio.emit("game_state", game_state.to_dict())

            # Clear events AFTER broadcast so game_state includes them
            if game_state.powerup_events:
                game_state.powerup_events.clear()
            game_state.snake_eat_events.clear()
            game_state.fire_destroy_events.clear()
            if hasattr(game_state, 'ball_collision_events'):
                game_state.ball_collision_events.clear()

            work_time = time.monotonic() - tick_start
            socketio.sleep(max(0, dt - work_time))
    except Exception as e:
        logger.error("Game loop error: %s", e)
    finally:
        game_loop_running = False


@socketio.on_error_default
def default_error_handler(e):
    """Catch-all for SocketIO errors."""
    logger.error("SocketIO error: %s", e)


if __name__ == "__main__":
    logger.info("Starting Dave Ball backend on %s:%s", BACKEND_HOST, BACKEND_PORT)
    socketio.run(
        app,
        host=BACKEND_HOST,
        port=BACKEND_PORT,
        debug=False,
        use_reloader=False,
    )
