"""
Ball physics tests for the Dave Ball arcade game.

Covers:
  - Velocity-based movement over a time step
  - Wall bounce reflection (all four walls + corners)
  - Energy / velocity-magnitude preservation (elastic collisions)
  - Line-ball collision detection (growing lines)
  - Multi-ball independence

All imports reference planned module paths.  Tests will raise ImportError
until the backend physics module is implemented — that's expected for TDD.
"""

import math
import pytest

from backend.physics import (
    Ball,
    update_ball_position,
    check_wall_collision,
    check_line_ball_collision,
)

# ---------------------------------------------------------------------------
# Markers
# ---------------------------------------------------------------------------
pytestmark = pytest.mark.physics


# ===========================================================================
# Movement
# ===========================================================================

class TestBallMovement:
    """Ball moves according to velocity × dt."""

    def test_ball_moves_correctly_with_velocity(self, single_ball):
        """Position should advance by (vx*dt, vy*dt) after one time step."""
        dt = 1 / 30  # 30 Hz tick
        original_x, original_y = single_ball.x, single_ball.y

        update_ball_position(single_ball, dt)

        expected_x = original_x + single_ball.vx * dt
        expected_y = original_y + single_ball.vy * dt
        assert single_ball.x == pytest.approx(expected_x, abs=1e-6)
        assert single_ball.y == pytest.approx(expected_y, abs=1e-6)


# ===========================================================================
# Wall bounces
# ===========================================================================

class TestWallBounce:
    """Ball reflects off walls when its edge reaches a boundary."""

    def test_bounce_off_right_wall(self, play_area):
        """When x + radius >= right boundary, vx should reverse."""
        ball = Ball(x=795.0, y=300.0, vx=200.0, vy=0.0, radius=10.0)
        # ball edge at 805 → past the right wall at 800
        check_wall_collision(ball, play_area)
        assert ball.vx < 0, "vx must be negative after right-wall bounce"

    def test_bounce_off_left_wall(self, play_area):
        """When x - radius <= left boundary, vx should reverse."""
        ball = Ball(x=5.0, y=300.0, vx=-200.0, vy=0.0, radius=10.0)
        # ball edge at -5 → past the left wall at 0
        check_wall_collision(ball, play_area)
        assert ball.vx > 0, "vx must be positive after left-wall bounce"

    def test_bounce_off_top_wall(self, play_area):
        """When y - radius <= top boundary, vy should reverse."""
        ball = Ball(x=400.0, y=5.0, vx=0.0, vy=-200.0, radius=10.0)
        check_wall_collision(ball, play_area)
        assert ball.vy > 0, "vy must be positive after top-wall bounce"

    def test_bounce_off_bottom_wall(self, play_area):
        """When y + radius >= bottom boundary, vy should reverse."""
        ball = Ball(x=400.0, y=595.0, vx=0.0, vy=200.0, radius=10.0)
        check_wall_collision(ball, play_area)
        assert ball.vy < 0, "vy must be negative after bottom-wall bounce"

    def test_bounce_off_corner_reflects_both_components(self, play_area):
        """Ball hitting two walls simultaneously reverses both vx and vy."""
        # Place ball in bottom-right corner, both edges past boundaries
        ball = Ball(x=795.0, y=595.0, vx=200.0, vy=200.0, radius=10.0)
        check_wall_collision(ball, play_area)
        assert ball.vx < 0, "vx must be negative after corner bounce"
        assert ball.vy < 0, "vy must be negative after corner bounce"


# ===========================================================================
# Energy preservation
# ===========================================================================

class TestElasticCollision:
    """Velocity magnitude must stay constant after elastic wall bounce."""

    def test_velocity_magnitude_preserved_after_bounce(self, play_area):
        """Speed (|v|) should be the same before and after a wall collision."""
        ball = Ball(x=795.0, y=300.0, vx=150.0, vy=100.0, radius=10.0)
        speed_before = math.hypot(ball.vx, ball.vy)

        check_wall_collision(ball, play_area)

        speed_after = math.hypot(ball.vx, ball.vy)
        assert speed_after == pytest.approx(speed_before, rel=1e-9), \
            "Speed must be preserved in elastic collision"


# ===========================================================================
# Line-ball collision
# ===========================================================================

class TestLineBallCollision:
    """Detection of ball touching / intersecting a growing line segment."""

    def test_ball_touching_line_is_detected(self):
        """Ball whose edge intersects the line segment registers a collision."""
        ball = Ball(x=400.0, y=300.0, vx=0.0, vy=0.0, radius=10.0)
        # Horizontal line passing right through the ball center
        line = {"x1": 350.0, "y1": 300.0, "x2": 450.0, "y2": 300.0}
        assert check_line_ball_collision(line, ball) is True

    def test_ball_far_from_line_no_collision(self):
        """Ball clearly away from the line should not collide."""
        ball = Ball(x=400.0, y=100.0, vx=0.0, vy=0.0, radius=10.0)
        # Line far below the ball
        line = {"x1": 350.0, "y1": 400.0, "x2": 450.0, "y2": 400.0}
        assert check_line_ball_collision(line, ball) is False

    def test_ball_hitting_line_endpoint_exactly(self):
        """Ball whose center is exactly radius-distance from a line endpoint."""
        ball = Ball(x=460.0, y=300.0, vx=0.0, vy=0.0, radius=10.0)
        # Line ends at (450, 300); ball center is exactly 10 px away → touching
        line = {"x1": 350.0, "y1": 300.0, "x2": 450.0, "y2": 300.0}
        assert check_line_ball_collision(line, ball) is True


# ===========================================================================
# Multi-ball independence
# ===========================================================================

class TestMultiBallPhysics:
    """Multiple balls must not interfere with each other's physics."""

    def test_multiple_balls_independent_movement(self, two_balls):
        """Updating one ball should not affect the other's position."""
        ball_a, ball_b = two_balls
        dt = 1 / 30

        orig_b_x, orig_b_y = ball_b.x, ball_b.y

        update_ball_position(ball_a, dt)

        # ball_b should be completely untouched
        assert ball_b.x == orig_b_x
        assert ball_b.y == orig_b_y

    def test_multiple_balls_independent_wall_bounce(self, two_balls, play_area):
        """A wall bounce on one ball must not alter the other ball's velocity."""
        ball_a, ball_b = two_balls

        # Push ball_a against the right wall
        ball_a.x = 795.0
        ball_a.vx = 200.0
        orig_b_vx, orig_b_vy = ball_b.vx, ball_b.vy

        check_wall_collision(ball_a, play_area)

        assert ball_b.vx == orig_b_vx
        assert ball_b.vy == orig_b_vy
