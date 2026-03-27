"""
Tests for the scoring system and multi-level progression in Dave Ball.

Covers: time bonus, life bonus, efficiency bonus, fill bonus,
level score calculation, level progression (next_level), and
multi-level state resets.
"""

import math

import pytest

from backend.game_state import GameState
from backend.physics import Ball
from backend.config import (
    BALL_RADIUS,
    BALL_SPEED,
    EFFICIENCY_BONUS_BASE,
    EFFICIENCY_BONUS_PENALTY,
    INITIAL_LIVES,
    LEVEL_TIME_LIMIT,
    LIFE_BONUS_POINTS,
    TIME_BONUS_BASE,
    TIME_BONUS_DECAY,
    WIN_FILL_PERCENT,
)

pytestmark = pytest.mark.scoring


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_game(width=200, height=200, balls=None):
    gs = GameState(width=width, height=height, num_balls=0)
    gs._clear_obstacles()
    gs.balls.clear()
    if balls:
        for x, y, vx, vy in balls:
            gs.balls.append(Ball(x, y, vx, vy, BALL_RADIUS))
    gs.state = "playing"
    return gs


# ---------------------------------------------------------------------------
# Timer
# ---------------------------------------------------------------------------

class TestTimer:
    def test_timer_starts_at_level_time_limit(self):
        gs = _make_game()
        assert gs.level_timer == LEVEL_TIME_LIMIT

    def test_timer_decrements(self):
        gs = _make_game()
        gs.update_timer(5.0)
        assert gs.level_timer == pytest.approx(LEVEL_TIME_LIMIT - 5.0)

    def test_timer_does_not_go_below_zero(self):
        gs = _make_game()
        gs.update_timer(LEVEL_TIME_LIMIT + 100)
        assert gs.level_timer == 0.0


# ---------------------------------------------------------------------------
# Score breakdown
# ---------------------------------------------------------------------------

class TestScoreCalculation:
    def test_time_bonus_full_time_remaining(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        gs.lives = 3
        gs.lines_drawn = 1
        gs.fill_percentage = 80.0
        # Timer hasn't moved → all time remaining
        breakdown = gs.calculate_level_score()
        expected_time_bonus = int(TIME_BONUS_BASE * math.exp(-TIME_BONUS_DECAY * 0))
        assert breakdown["time_bonus"] == expected_time_bonus

    def test_time_bonus_zero_when_timer_expired(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        gs.level_timer = 0.0
        gs.lives = 3
        gs.lines_drawn = 1
        gs.fill_percentage = 80.0
        breakdown = gs.calculate_level_score()
        assert breakdown["time_bonus"] == 0

    def test_time_bonus_decays_with_elapsed_time(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        gs.level_timer = LEVEL_TIME_LIMIT / 2  # half time remaining
        gs.lives = 3
        gs.lines_drawn = 1
        gs.fill_percentage = 80.0
        breakdown = gs.calculate_level_score()
        elapsed = LEVEL_TIME_LIMIT - gs.level_timer
        expected = int(TIME_BONUS_BASE * math.exp(-TIME_BONUS_DECAY * elapsed))
        assert breakdown["time_bonus"] == expected

    def test_lives_bonus(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        gs.lives = 4
        gs.lines_drawn = 1
        gs.fill_percentage = 80.0
        breakdown = gs.calculate_level_score()
        assert breakdown["lives_bonus"] == 4 * LIFE_BONUS_POINTS

    def test_efficiency_bonus_one_line(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        gs.lives = 1
        gs.lines_drawn = 1
        gs.fill_percentage = 80.0
        breakdown = gs.calculate_level_score()
        expected = max(0, EFFICIENCY_BONUS_BASE - (1 - 1) * EFFICIENCY_BONUS_PENALTY)
        assert breakdown["efficiency_bonus"] == expected

    def test_efficiency_bonus_many_lines(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        gs.lives = 1
        gs.lines_drawn = 20
        gs.fill_percentage = 80.0
        breakdown = gs.calculate_level_score()
        expected = max(0, EFFICIENCY_BONUS_BASE - (20 - 1) * EFFICIENCY_BONUS_PENALTY)
        assert breakdown["efficiency_bonus"] == expected

    def test_efficiency_bonus_does_not_go_negative(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        gs.lives = 1
        gs.lines_drawn = 100
        gs.fill_percentage = 80.0
        breakdown = gs.calculate_level_score()
        assert breakdown["efficiency_bonus"] >= 0

    def test_fill_bonus(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        gs.lives = 1
        gs.lines_drawn = 1
        gs.fill_percentage = 85.0
        breakdown = gs.calculate_level_score()
        assert breakdown["fill_bonus"] == int(85.0 * 10)

    def test_total_is_sum_of_components(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        gs.lives = 3
        gs.lines_drawn = 2
        gs.fill_percentage = 75.0
        breakdown = gs.calculate_level_score()
        expected_total = (
            breakdown["time_bonus"]
            + breakdown["lives_bonus"]
            + breakdown["efficiency_bonus"]
            + breakdown["fill_bonus"]
        )
        assert breakdown["total"] == expected_total

    def test_score_added_to_cumulative(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        gs.score = 1000
        gs.lives = 2
        gs.lines_drawn = 1
        gs.fill_percentage = 80.0
        breakdown = gs.calculate_level_score()
        assert gs.score == 1000 + breakdown["total"]

    def test_level_score_breakdown_stored(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        gs.lives = 1
        gs.lines_drawn = 1
        gs.fill_percentage = 80.0
        gs.calculate_level_score()
        assert gs.level_score_breakdown is not None
        assert "total" in gs.level_score_breakdown


# ---------------------------------------------------------------------------
# Multi-level progression
# ---------------------------------------------------------------------------

class TestLevelProgression:
    def test_next_level_increments_level(self):
        gs = _make_game()
        gs.level = 1
        gs.next_level()
        assert gs.level == 2

    def test_next_level_adds_more_balls(self):
        gs = _make_game()
        gs.level = 1
        gs.next_level()
        # level 2 → num_balls = level + 1 = 3
        assert len(gs.balls) == 3

    def test_next_level_increases_ball_speed(self):
        gs = _make_game(balls=[(100, 100, 50, 50)])
        gs.level = 1
        gs.next_level()
        # Speed = BALL_SPEED * speed_multiplier * 1.1^(level-1)
        # For level 2: BALL_SPEED * 1.0 * 1.1
        for ball in gs.balls:
            speed = math.sqrt(ball.vx ** 2 + ball.vy ** 2)
            expected_speed = BALL_SPEED * gs.speed_multiplier * (1.1 ** (gs.level - 1))
            assert speed == pytest.approx(expected_speed, rel=0.1)

    def test_next_level_resets_fill_percentage(self):
        gs = _make_game()
        gs.fill_percentage = 85.0
        gs.next_level()
        assert gs.fill_percentage == 0.0

    def test_next_level_preserves_score(self):
        gs = _make_game()
        gs.score = 5000
        gs.next_level()
        assert gs.score == 5000

    def test_next_level_resets_timer(self):
        gs = _make_game()
        gs.level_timer = 10.0
        gs.next_level()
        assert gs.level_timer == LEVEL_TIME_LIMIT

    def test_next_level_resets_powerup_state(self):
        gs = _make_game()
        gs.is_slowed = True
        gs.shield_active = True
        gs.lightning_charges = 5
        gs.is_frozen = True
        gs.next_level()
        assert gs.is_slowed is False
        assert gs.shield_active is False
        assert gs.lightning_charges == 0
        assert gs.is_frozen is False

    def test_next_level_clears_growing_lines(self):
        gs = _make_game()
        from backend.game_state import GrowingLine
        gs.growing_lines.append(GrowingLine(50, 50, "vertical", 0, 200))
        gs.next_level()
        assert len(gs.growing_lines) == 0

    def test_next_level_clears_snake_and_magnet(self):
        gs = _make_game()
        from backend.game_state import Snake, Magnet
        gs.snake = Snake(100, 100)
        gs.magnet = Magnet(50, 50, 10.0)
        gs.next_level()
        assert gs.snake is None
        assert gs.magnet is None

    def test_next_level_state_is_playing(self):
        gs = _make_game()
        gs.state = "won"
        gs.next_level()
        assert gs.state == "playing"

    def test_next_level_resets_lines_drawn(self):
        gs = _make_game()
        gs.lines_drawn = 15
        gs.next_level()
        assert gs.lines_drawn == 0

    def test_reset_returns_to_level_1(self):
        gs = _make_game()
        gs.level = 5
        gs.score = 10000
        gs.reset()
        assert gs.level == 1
        assert gs.score == 0
        assert gs.state == "waiting"
