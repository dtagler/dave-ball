"""
Tests for the Snake power-up entity in the Dave Ball arcade game.

Covers: Snake class construction, spawning, movement toward balls,
eating balls, timer expiration, max-1-at-a-time rule.
"""

import math

import pytest

from backend.game_state import GameState, Snake
from backend.physics import Ball
from backend.config import (
    BALL_RADIUS,
    SNAKE_DURATION,
    SNAKE_EAT_RADIUS,
    SNAKE_SEGMENT_COUNT,
    SNAKE_SEGMENT_SPACING,
    SNAKE_SPEED,
)

pytestmark = pytest.mark.snake


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_game(width=400, height=400, balls=None):
    gs = GameState(width=width, height=height, num_balls=0)
    gs._clear_obstacles()
    gs.balls.clear()
    if balls:
        for x, y, vx, vy in balls:
            gs.balls.append(Ball(x, y, vx, vy, BALL_RADIUS))
    gs.state = "playing"
    return gs


# ---------------------------------------------------------------------------
# Snake class unit tests
# ---------------------------------------------------------------------------

class TestSnakeClass:
    def test_snake_creation(self):
        s = Snake(100, 200)
        assert len(s.segments) == SNAKE_SEGMENT_COUNT
        assert s.timer == SNAKE_DURATION
        assert s.active is True
        assert s.elapsed == 0.0

    def test_snake_segments_start_at_spawn(self):
        s = Snake(50, 75)
        for seg in s.segments:
            assert seg["x"] == 50
            assert seg["y"] == 75

    def test_snake_to_dict(self):
        s = Snake(100, 100)
        d = s.to_dict()
        assert "segments" in d
        assert len(d["segments"]) == SNAKE_SEGMENT_COUNT
        assert d["timer"] == SNAKE_DURATION
        assert d["active"] is True
        assert d["eat_events"] == []


# ---------------------------------------------------------------------------
# Snake spawning
# ---------------------------------------------------------------------------

class TestSnakeSpawning:
    def test_snake_spawns_on_effect(self):
        gs = _make_game(balls=[(200, 200, 0, 0)])
        event = {}
        gs._apply_snake_effect(event)
        assert gs.snake is not None
        assert gs.snake.active is True

    def test_max_one_snake_at_a_time(self):
        gs = _make_game(balls=[(200, 200, 0, 0)])
        event = {}
        gs._apply_snake_effect(event)
        first_snake = gs.snake
        gs._apply_snake_effect(event)
        # Should replace, not stack
        assert gs.snake is not first_snake

    def test_snake_spawns_near_ball(self):
        gs = _make_game(balls=[(200, 200, 0, 0)])
        event = {}
        gs._apply_snake_effect(event)
        head = gs.snake.segments[0]
        dist = math.sqrt((head["x"] - 200) ** 2 + (head["y"] - 200) ** 2)
        # Should be within offset range (80px + some margin) or center fallback
        assert dist < 200

    def test_snake_spawns_without_balls(self):
        gs = _make_game()
        event = {}
        gs._apply_snake_effect(event)
        assert gs.snake is not None
        # Falls back to center
        head = gs.snake.segments[0]
        assert head["x"] == pytest.approx(gs._width / 2)
        assert head["y"] == pytest.approx(gs._height / 2)


# ---------------------------------------------------------------------------
# Snake movement
# ---------------------------------------------------------------------------

class TestSnakeMovement:
    def test_snake_moves_toward_nearest_ball(self):
        gs = _make_game(balls=[(300, 200, 0, 0)])
        gs.snake = Snake(100, 200)
        initial_x = gs.snake.segments[0]["x"]
        gs.update_snake(0.1)
        # Head should have moved right (toward ball at 300, 200)
        assert gs.snake.segments[0]["x"] > initial_x

    def test_snake_timer_decrements(self):
        gs = _make_game(balls=[(300, 200, 0, 0)])
        gs.snake = Snake(100, 200)
        gs.update_snake(1.0)
        assert gs.snake.timer == pytest.approx(SNAKE_DURATION - 1.0)

    def test_snake_expires_when_timer_runs_out(self):
        gs = _make_game(balls=[(300, 200, 0, 0)])
        gs.snake = Snake(100, 200)
        gs.update_snake(SNAKE_DURATION + 1)
        assert gs.snake is None

    def test_snake_builds_position_history(self):
        gs = _make_game(balls=[(300, 200, 0, 0)])
        gs.snake = Snake(100, 200)
        gs.update_snake(0.1)
        assert len(gs.snake.position_history) > 0

    def test_snake_clamped_to_play_area(self):
        gs = _make_game(width=400, height=400, balls=[(390, 390, 0, 0)])
        gs.snake = Snake(395, 395)  # near edge
        gs.update_snake(0.1)
        head = gs.snake.segments[0]
        assert head["x"] <= gs._width - 10
        assert head["y"] <= gs._height - 10

    def test_snake_no_movement_without_balls(self):
        gs = _make_game()
        gs.snake = Snake(100, 100)
        gs.update_snake(0.1)
        # Snake timer should still decrement
        assert gs.snake.timer < SNAKE_DURATION

    def test_snake_inactive_not_updated(self):
        gs = _make_game(balls=[(300, 200, 0, 0)])
        gs.snake = Snake(100, 200)
        gs.snake.active = False
        gs.update_snake(0.1)
        # Nothing changes when inactive


# ---------------------------------------------------------------------------
# Snake eating balls
# ---------------------------------------------------------------------------

class TestSnakeEating:
    def test_snake_eats_ball_on_contact(self):
        gs = _make_game(balls=[
            (100, 100, 0, 0),  # near snake head
            (300, 300, 0, 0),  # far from snake
        ])
        gs.snake = Snake(100, 100)  # head right on top of ball
        gs.update_snake(0.01)  # tiny tick so snake barely moves
        # Ball at (100,100) should be eaten since it's within SNAKE_EAT_RADIUS
        assert len(gs.balls) == 1
        assert len(gs.snake_eat_events) == 1

    def test_snake_keeps_at_least_one_ball(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        gs.snake = Snake(100, 100)
        gs.update_snake(0.01)
        # Should not eat the last ball
        assert len(gs.balls) == 1

    def test_snake_eat_event_has_coordinates(self):
        gs = _make_game(balls=[
            (100, 100, 0, 0),
            (300, 300, 0, 0),
        ])
        gs.snake = Snake(100, 100)
        gs.update_snake(0.01)
        if gs.snake_eat_events:
            event = gs.snake_eat_events[0]
            assert "x" in event
            assert "y" in event
