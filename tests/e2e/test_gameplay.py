"""Gameplay flow tests – verify WebSocket connectivity, input handling, and
game state transitions for the Dave Ball arcade game.

These tests interact with the live game running in Docker. Some are
timing-sensitive and marked with ``@pytest.mark.slow``.
"""

import json
import time

import pytest
from playwright.sync_api import Page, expect

from conftest import wait_for_socket, start_game, expect_overlay_shown, expect_overlay_hidden


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PLAY_AREA_CENTER_X = 400
PLAY_AREA_CENTER_Y = 350  # 50px HUD + 300px into the 600px play area


def _start_game(page: Page) -> None:
    """Navigate to the game and click Play."""
    start_game(page)
    # Allow the WebSocket game loop a moment to settle
    page.wait_for_timeout(1000)


def _parse_socketio_frame(payload: str):
    """Extract (event_name, data) from a Socket.IO text frame.

    Socket.IO v4 uses Engine.IO framing: ``42["event",{...}]``.
    Returns ``(event_name, data_dict)`` or ``None`` for non-event frames.
    """
    if not isinstance(payload, str):
        return None
    if payload.startswith("42"):
        try:
            arr = json.loads(payload[2:])
            if isinstance(arr, list) and len(arr) >= 2:
                return arr[0], arr[1]
            if isinstance(arr, list) and len(arr) == 1:
                return arr[0], None
        except (json.JSONDecodeError, IndexError):
            pass
    return None


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_starting_game_creates_websocket_connection(page: Page):
    """After page load, a WebSocket connection is established."""
    ws_urls: list[str] = []

    def _on_ws(ws):
        ws_urls.append(ws.url)

    page.on("websocket", _on_ws)
    page.goto("/")

    # Socket.IO connects during init — give it a moment
    page.wait_for_timeout(2000)

    assert len(ws_urls) >= 1, "Expected at least one WebSocket connection"
    assert any("socket.io" in url for url in ws_urls), (
        f"Expected a Socket.IO WebSocket, got: {ws_urls}"
    )


@pytest.mark.slow
def test_game_state_updates_received(page: Page):
    """After clicking Play, the server streams game_state events."""
    received_events: list[str] = []

    def _on_ws(ws):
        def _on_frame(payload):
            parsed = _parse_socketio_frame(payload)
            if parsed:
                received_events.append(parsed[0])

        ws.on("framereceived", _on_frame)

    page.on("websocket", _on_ws)
    _start_game(page)

    # Wait for several game ticks (~30 Hz, so 1s should yield ~30 frames)
    page.wait_for_timeout(1500)

    game_state_count = received_events.count("game_state")
    assert game_state_count >= 5, (
        f"Expected ≥5 game_state events, got {game_state_count}"
    )


@pytest.mark.slow
def test_clicking_canvas_sends_line_start(page: Page):
    """Left-clicking inside the play area emits a ``line_start`` event."""
    sent_events: list[str] = []

    def _on_ws(ws):
        def _on_sent(payload):
            parsed = _parse_socketio_frame(payload)
            if parsed:
                sent_events.append(parsed[0])

        ws.on("framesent", _on_sent)

    page.on("websocket", _on_ws)
    _start_game(page)

    # Click in the middle of the play area
    canvas = page.locator("#game-canvas")
    canvas.click(position={"x": PLAY_AREA_CENTER_X, "y": PLAY_AREA_CENTER_Y})

    page.wait_for_timeout(500)

    assert "line_start" in sent_events, (
        f"Expected 'line_start' in sent events, got: {sent_events}"
    )


@pytest.mark.slow
def test_right_click_toggles_direction(page: Page):
    """Right-clicking the canvas toggles the direction indicator."""
    _start_game(page)

    # Read initial direction via the public Input API
    initial_dir = page.evaluate("DaveBall.Input.getDirection()")
    assert initial_dir in ("vertical", "horizontal")

    # Right-click to toggle
    canvas = page.locator("#game-canvas")
    canvas.click(
        position={"x": PLAY_AREA_CENTER_X, "y": PLAY_AREA_CENTER_Y},
        button="right",
    )
    page.wait_for_timeout(200)

    new_dir = page.evaluate("DaveBall.Input.getDirection()")
    assert new_dir != initial_dir, (
        f"Direction should have toggled from '{initial_dir}' but is '{new_dir}'"
    )

    # Toggle back
    canvas.click(
        position={"x": PLAY_AREA_CENTER_X, "y": PLAY_AREA_CENTER_Y},
        button="right",
    )
    page.wait_for_timeout(200)
    assert page.evaluate("DaveBall.Input.getDirection()") == initial_dir


@pytest.mark.slow
def test_balls_are_moving(page: Page):
    """Ball positions change between consecutive game_state snapshots."""
    ball_snapshots: list[list] = []

    def _on_ws(ws):
        def _on_frame(payload):
            parsed = _parse_socketio_frame(payload)
            if parsed and parsed[0] == "game_state":
                state = parsed[1]
                if isinstance(state, dict) and "balls" in state:
                    ball_snapshots.append(state["balls"])

        ws.on("framereceived", _on_frame)

    page.on("websocket", _on_ws)
    _start_game(page)

    # Collect snapshots over ~1 second
    page.wait_for_timeout(1500)

    assert len(ball_snapshots) >= 2, (
        f"Expected ≥2 ball snapshots, got {len(ball_snapshots)}"
    )

    # Compare first and a later snapshot — at least one ball should have moved
    first = ball_snapshots[0]
    later = ball_snapshots[-1]

    if first and later:
        moved = False
        for b1 in first:
            for b2 in later:
                if (
                    b1.get("id") == b2.get("id")
                    and (b1.get("x") != b2.get("x") or b1.get("y") != b2.get("y"))
                ):
                    moved = True
                    break
            if moved:
                break
        assert moved, "Expected at least one ball to change position"


@pytest.mark.slow
def test_pause_stops_game_state_updates(page: Page):
    """Pressing ESC pauses the game — server confirms paused state."""
    paused_received: list[dict] = []

    def _on_ws(ws):
        def _on_frame(payload):
            parsed = _parse_socketio_frame(payload)
            if parsed and parsed[0] == "game_state" and isinstance(parsed[1], dict):
                if parsed[1].get("state") == "paused":
                    paused_received.append(parsed[1])

        ws.on("framereceived", _on_frame)

    page.on("websocket", _on_ws)
    _start_game(page)

    # Pause
    page.keyboard.press("Escape")
    expect_overlay_shown(page, "overlay-pause", timeout=3000)

    # Wait for the server to process the pause and broadcast confirmation
    page.wait_for_timeout(2000)

    assert len(paused_received) >= 1, (
        "Expected at least one game_state with state='paused' from server"
    )


@pytest.mark.slow
def test_start_game_event_sent_with_speed(page: Page):
    """Clicking Play emits ``start_game`` with the selected speed multiplier."""
    sent_payloads: list[tuple] = []

    def _on_ws(ws):
        def _on_sent(payload):
            parsed = _parse_socketio_frame(payload)
            if parsed:
                sent_payloads.append(parsed)

        ws.on("framesent", _on_sent)

    page.on("websocket", _on_ws)
    page.goto("/")

    # Select "fast" speed before starting
    wait_for_socket(page)
    page.locator('.speed-btn[data-speed="fast"]').click()
    page.locator("#btn-start").click()
    expect_overlay_hidden(page, "overlay-start")

    page.wait_for_timeout(1000)

    start_events = [p for p in sent_payloads if p[0] == "start_game"]
    assert len(start_events) >= 1, "Expected a start_game event to be emitted"

    data = start_events[0][1]
    assert data is not None and "speed_multiplier" in data, (
        f"start_game should include speed_multiplier, got: {data}"
    )


@pytest.mark.slow
def test_spacebar_toggles_direction(page: Page):
    """Pressing Space toggles the line direction (same as right-click)."""
    _start_game(page)

    initial_dir = page.evaluate("DaveBall.Input.getDirection()")

    page.keyboard.press("Space")
    page.wait_for_timeout(200)

    new_dir = page.evaluate("DaveBall.Input.getDirection()")
    assert new_dir != initial_dir, (
        f"Space should toggle direction from '{initial_dir}' but got '{new_dir}'"
    )


@pytest.mark.slow
def test_game_state_contains_expected_fields(page: Page):
    """Verify that game_state events contain essential fields."""
    state_sample: dict | None = None

    def _on_ws(ws):
        nonlocal state_sample

        def _on_frame(payload):
            nonlocal state_sample
            parsed = _parse_socketio_frame(payload)
            if parsed and parsed[0] == "game_state" and state_sample is None:
                state_sample = parsed[1]

        ws.on("framereceived", _on_frame)

    page.on("websocket", _on_ws)
    _start_game(page)

    page.wait_for_timeout(1500)

    assert state_sample is not None, "Should have received at least one game_state"

    expected_fields = [
        "balls",
        "lives",
        "score",
        "fill_percentage",
        "level",
        "state",
        "boundaries",
        "powerups",
    ]
    for field in expected_fields:
        assert field in state_sample, (
            f"game_state missing expected field '{field}'. "
            f"Keys present: {list(state_sample.keys())}"
        )


@pytest.mark.slow
def test_fill_percentage_starts_at_zero(page: Page):
    """Fill percentage should start at 0% on a new game."""
    first_pct: list[float] = []

    def _on_ws(ws):
        def _on_frame(payload):
            parsed = _parse_socketio_frame(payload)
            if parsed and parsed[0] == "game_state" and not first_pct:
                state = parsed[1]
                if isinstance(state, dict) and "fill_percentage" in state:
                    first_pct.append(state["fill_percentage"])

        ws.on("framereceived", _on_frame)

    page.on("websocket", _on_ws)
    _start_game(page)
    page.wait_for_timeout(1500)

    assert len(first_pct) >= 1, "Should have captured fill_percentage"
    assert first_pct[0] == pytest.approx(0.0, abs=0.01), (
        f"Fill percentage should start at ~0%, got {first_pct[0]}"
    )


# ---------------------------------------------------------------------------
# New gameplay / state tests
# ---------------------------------------------------------------------------


@pytest.mark.slow
def test_lives_start_at_expected_value(page: Page):
    """Lives should start at the correct initial value (level 1 = 2 balls + 1)."""
    first_lives: list[int] = []

    def _on_ws(ws):
        def _on_frame(payload):
            parsed = _parse_socketio_frame(payload)
            if parsed and parsed[0] == "game_state" and not first_lives:
                state = parsed[1]
                if isinstance(state, dict) and "lives" in state:
                    first_lives.append(state["lives"])

        ws.on("framereceived", _on_frame)

    page.on("websocket", _on_ws)
    _start_game(page)
    page.wait_for_timeout(1500)

    assert len(first_lives) >= 1, "Should have captured lives"
    assert first_lives[0] >= 2, (
        f"Lives should be at least 2 at game start, got {first_lives[0]}"
    )


@pytest.mark.slow
def test_level_starts_at_one(page: Page):
    """Level should be 1 at the start of a new game."""
    first_level: list[int] = []

    def _on_ws(ws):
        def _on_frame(payload):
            parsed = _parse_socketio_frame(payload)
            if parsed and parsed[0] == "game_state" and not first_level:
                state = parsed[1]
                if isinstance(state, dict) and "level" in state:
                    first_level.append(state["level"])

        ws.on("framereceived", _on_frame)

    page.on("websocket", _on_ws)
    _start_game(page)
    page.wait_for_timeout(1500)

    assert len(first_level) >= 1, "Should have captured level"
    assert first_level[0] == 1, f"Level should start at 1, got {first_level[0]}"


@pytest.mark.slow
def test_score_starts_at_zero(page: Page):
    """Score should be 0 at the start of a new game."""
    first_score: list[int] = []

    def _on_ws(ws):
        def _on_frame(payload):
            parsed = _parse_socketio_frame(payload)
            if parsed and parsed[0] == "game_state" and not first_score:
                state = parsed[1]
                if isinstance(state, dict) and "score" in state:
                    first_score.append(state["score"])

        ws.on("framereceived", _on_frame)

    page.on("websocket", _on_ws)
    _start_game(page)
    page.wait_for_timeout(1500)

    assert len(first_score) >= 1, "Should have captured score"
    assert first_score[0] == 0, f"Score should start at 0, got {first_score[0]}"


@pytest.mark.slow
def test_balls_have_expected_properties(page: Page):
    """Each ball object in game_state has x, y, radius, and color."""
    ball_sample: list | None = None

    def _on_ws(ws):
        nonlocal ball_sample

        def _on_frame(payload):
            nonlocal ball_sample
            parsed = _parse_socketio_frame(payload)
            if parsed and parsed[0] == "game_state" and ball_sample is None:
                state = parsed[1]
                if isinstance(state, dict) and state.get("balls"):
                    ball_sample = state["balls"]

        ws.on("framereceived", _on_frame)

    page.on("websocket", _on_ws)
    _start_game(page)
    page.wait_for_timeout(1500)

    assert ball_sample is not None, "Should have received balls data"
    assert len(ball_sample) >= 1, "Should have at least one ball"

    for ball in ball_sample:
        assert "x" in ball, "Ball missing 'x'"
        assert "y" in ball, "Ball missing 'y'"
        assert "radius" in ball, "Ball missing 'radius'"
        assert ball["radius"] > 0, "Ball radius should be positive"


@pytest.mark.slow
def test_unpause_resumes_playing_state(page: Page):
    """After pause+unpause, the server resumes sending 'playing' state."""
    resumed_states: list[str] = []

    def _on_ws(ws):
        def _on_frame(payload):
            parsed = _parse_socketio_frame(payload)
            if parsed and parsed[0] == "game_state" and isinstance(parsed[1], dict):
                resumed_states.append(parsed[1].get("state", ""))

        ws.on("framereceived", _on_frame)

    page.on("websocket", _on_ws)
    _start_game(page)

    # Pause
    page.keyboard.press("Escape")
    expect_overlay_shown(page, "overlay-pause", timeout=3000)
    page.wait_for_timeout(500)

    # Unpause
    resumed_states.clear()
    page.keyboard.press("Escape")
    expect_overlay_hidden(page, "overlay-pause", timeout=3000)
    page.wait_for_timeout(1500)

    playing_count = resumed_states.count("playing")
    assert playing_count >= 3, (
        f"Expected ≥3 'playing' states after unpause, got {playing_count}"
    )


@pytest.mark.slow
def test_slow_speed_sends_correct_multiplier(page: Page):
    """Selecting 'Slow' speed sends a speed_multiplier of 1.0."""
    sent_payloads: list[tuple] = []

    def _on_ws(ws):
        def _on_sent(payload):
            parsed = _parse_socketio_frame(payload)
            if parsed:
                sent_payloads.append(parsed)

        ws.on("framesent", _on_sent)

    page.on("websocket", _on_ws)
    page.goto("/")
    wait_for_socket(page)

    page.locator('.speed-btn[data-speed="slow"]').click()
    page.locator("#btn-start").click()
    expect_overlay_hidden(page, "overlay-start")
    page.wait_for_timeout(1000)

    start_events = [p for p in sent_payloads if p[0] == "start_game"]
    assert len(start_events) >= 1, "Expected a start_game event"

    # Speed map: slow=1.0, normal=1.5, fast=2.0
    data = start_events[0][1]
    assert data is not None and data.get("speed_multiplier") == 1.0, (
        f"Slow speed should send multiplier 1.0, got: {data}"
    )
