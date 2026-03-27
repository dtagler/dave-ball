"""
Tests for Phase 4 — Line Growth Mechanics.

Covers:
  - GrowingLine class (arm growth, completion, segment generation)
  - GameState.start_line() validation (play area, duplicates, direction)
  - GameState.grow_lines() tick-based growth
  - GameState.complete_line() → boundary conversion
  - GameState.fail_line() → life loss and game-over
  - Line-ball collision during growth (integration)
  - Boundary-aware target endpoint finding
"""

import pytest

from backend.game_state import GameState, GrowingLine
from backend.physics import Ball, check_line_ball_collision
from backend.config import LINE_GROWTH_SPEED, INITIAL_LIVES

pytestmark = pytest.mark.line_growth


# ===========================================================================
# GrowingLine class
# ===========================================================================

class TestGrowingLine:
    """Unit tests for the GrowingLine data structure."""

    def test_vertical_line_grows_both_arms(self):
        """Both arms should extend from the origin toward their targets."""
        line = GrowingLine(
            start_x=400, start_y=300, direction="vertical",
            arm1_target=0, arm2_target=600,
        )
        line.grow(0.5)  # half a second at LINE_GROWTH_SPEED px/s
        expected = LINE_GROWTH_SPEED * 0.5
        assert line.arm1_progress == pytest.approx(expected, abs=1e-6)
        assert line.arm2_progress == pytest.approx(expected, abs=1e-6)

    def test_horizontal_line_grows_both_arms(self):
        line = GrowingLine(
            start_x=400, start_y=300, direction="horizontal",
            arm1_target=0, arm2_target=800,
        )
        line.grow(1.0)
        expected = LINE_GROWTH_SPEED * 1.0
        assert line.arm1_progress == pytest.approx(expected, abs=1e-6)
        assert line.arm2_progress == pytest.approx(expected, abs=1e-6)

    def test_arm_clamps_at_target(self):
        """An arm must not grow past its target boundary."""
        line = GrowingLine(
            start_x=400, start_y=50, direction="vertical",
            arm1_target=0, arm2_target=600,
        )
        # arm1_max = 50, so at 200px/s after 1s it would overshoot
        line.grow(1.0)
        assert line.arm1_progress == 50.0
        assert line.arm1_complete is True
        assert line.arm2_complete is False

    def test_is_complete_when_both_arms_done(self):
        line = GrowingLine(
            start_x=400, start_y=300, direction="vertical",
            arm1_target=0, arm2_target=600,
        )
        # Need enough time for both arms to reach borders
        line.grow(10.0)
        assert line.is_complete is True

    def test_get_segments_vertical(self):
        line = GrowingLine(
            start_x=400, start_y=300, direction="vertical",
            arm1_target=0, arm2_target=600,
        )
        line.grow(0.5)
        segs = line.get_segments()
        expected = LINE_GROWTH_SPEED * 0.5
        assert len(segs) == 2
        # arm1 goes up: (400, 300-expected) to (400, 300)
        assert segs[0]["x1"] == 400
        assert segs[0]["y1"] == pytest.approx(300.0 - expected, abs=1e-6)
        assert segs[0]["y2"] == 300
        # arm2 goes down: (400, 300) to (400, 300+expected)
        assert segs[1]["y1"] == 300
        assert segs[1]["y2"] == pytest.approx(300.0 + expected, abs=1e-6)

    def test_get_segments_horizontal(self):
        line = GrowingLine(
            start_x=400, start_y=300, direction="horizontal",
            arm1_target=0, arm2_target=800,
        )
        line.grow(0.5)
        segs = line.get_segments()
        expected = LINE_GROWTH_SPEED * 0.5
        assert len(segs) == 2
        assert segs[0]["x1"] == pytest.approx(400.0 - expected, abs=1e-6)
        assert segs[0]["x2"] == 400
        assert segs[1]["x1"] == 400
        assert segs[1]["x2"] == pytest.approx(400.0 + expected, abs=1e-6)

    def test_get_full_segment(self):
        line = GrowingLine(
            start_x=400, start_y=300, direction="vertical",
            arm1_target=0, arm2_target=600,
        )
        line.grow(0.5)
        seg = line.get_full_segment()
        expected = LINE_GROWTH_SPEED * 0.5
        assert seg["x1"] == 400
        assert seg["y1"] == pytest.approx(300.0 - expected, abs=1e-6)
        assert seg["y2"] == pytest.approx(300.0 + expected, abs=1e-6)

    def test_zero_progress_no_segments(self):
        """A freshly created line with no growth should have no segments."""
        line = GrowingLine(
            start_x=400, start_y=300, direction="vertical",
            arm1_target=0, arm2_target=600,
        )
        segs = line.get_segments()
        assert len(segs) == 0

    def test_to_dict_contains_expected_keys(self):
        line = GrowingLine(
            start_x=400, start_y=300, direction="vertical",
            arm1_target=0, arm2_target=600,
        )
        line.grow(0.1)
        d = line.to_dict()
        for key in ("start_x", "start_y", "direction", "x1", "y1", "x2", "y2",
                     "arm1_complete", "arm2_complete", "active"):
            assert key in d


# ===========================================================================
# GameState.start_line() validation
# ===========================================================================

class TestStartLine:
    """Validation rules for starting a new growing line."""

    def _make_state(self) -> GameState:
        gs = GameState(width=800, height=600, num_balls=0)
        gs._clear_obstacles()
        gs.state = "playing"
        return gs

    def test_valid_line_accepted(self):
        gs = self._make_state()
        result = gs.start_line(400, 300, "vertical")
        assert result is True
        assert len(gs.growing_lines) == 1

    def test_invalid_direction_rejected(self):
        gs = self._make_state()
        assert gs.start_line(400, 300, "diagonal") is False
        assert len(gs.growing_lines) == 0

    def test_click_outside_play_area_rejected(self):
        gs = self._make_state()
        assert gs.start_line(0, 300, "vertical") is False   # on left edge
        assert gs.start_line(800, 300, "vertical") is False  # on right edge
        assert gs.start_line(400, 0, "horizontal") is False  # on top edge
        assert gs.start_line(400, 600, "horizontal") is False  # on bottom edge
        assert gs.start_line(-5, 300, "vertical") is False
        assert len(gs.growing_lines) == 0

    def test_only_one_line_at_a_time(self):
        gs = self._make_state()
        gs.start_line(400, 300, "vertical")
        result = gs.start_line(200, 200, "horizontal")
        assert result is False
        assert len(gs.growing_lines) == 1

    def test_click_on_existing_boundary_rejected(self):
        gs = self._make_state()
        # Add a vertical boundary at x=400
        gs.add_boundary(400, 0, 400, 600)
        result = gs.start_line(400, 300, "vertical")
        assert result is False

    def test_can_start_new_line_after_previous_completes(self):
        gs = self._make_state()
        gs.start_line(400, 300, "vertical")
        line = gs.growing_lines[0]
        gs.complete_line(line)
        assert len(gs.growing_lines) == 0
        result = gs.start_line(200, 200, "horizontal")
        assert result is True


# ===========================================================================
# GameState.grow_lines() and complete_line()
# ===========================================================================

class TestGrowLines:
    """Test tick-based growth via GameState."""

    def _make_state(self) -> GameState:
        gs = GameState(width=800, height=600, num_balls=0)
        gs._clear_obstacles()
        gs.state = "playing"
        return gs

    def test_grow_lines_extends_active_line(self):
        gs = self._make_state()
        gs.start_line(400, 300, "vertical")
        gs.grow_lines(0.5)
        # Line should still be growing (300px up, 300px down — need 1.5s at 200px/s)
        assert len(gs.growing_lines) == 1
        seg = gs.growing_lines[0].get_full_segment()
        assert seg["y1"] < 300  # grew upward
        assert seg["y2"] > 300  # grew downward

    def test_line_auto_completes_when_reaching_borders(self):
        gs = self._make_state()
        initial_boundary_count = len(gs.boundaries)
        gs.start_line(400, 300, "vertical")
        # Grow for long enough that both arms reach the borders
        gs.grow_lines(10.0)
        # Line should have been completed and removed from growing_lines
        assert len(gs.growing_lines) == 0
        assert gs.territory_recalc_needed is True
        # A new boundary should have been added (beyond the initial walls + obstacles)
        assert len(gs.boundaries) == initial_boundary_count + 1

    def test_completed_line_becomes_boundary(self):
        gs = self._make_state()
        gs.start_line(400, 300, "vertical")
        gs.grow_lines(10.0)
        boundary = gs.boundaries[-1]
        assert boundary["x1"] == 400
        assert boundary["x2"] == 400
        assert boundary["y1"] == pytest.approx(0.0)
        assert boundary["y2"] == pytest.approx(600.0)

    def test_horizontal_line_completes_to_boundary(self):
        gs = self._make_state()
        gs.start_line(400, 300, "horizontal")
        gs.grow_lines(10.0)
        boundary = gs.boundaries[-1]
        assert boundary["y1"] == 300
        assert boundary["y2"] == 300
        assert boundary["x1"] == pytest.approx(0.0)
        assert boundary["x2"] == pytest.approx(800.0)


# ===========================================================================
# GameState.fail_line() — ball hits growing line
# ===========================================================================

class TestFailLine:
    """When a ball hits a growing line, it is destroyed and lives decrement."""

    def _make_state(self) -> GameState:
        gs = GameState(width=800, height=600, num_balls=0)
        gs._clear_obstacles()
        gs.state = "playing"
        return gs

    def test_fail_line_decrements_lives(self):
        gs = self._make_state()
        initial_lives = gs.lives
        gs.start_line(400, 300, "vertical")
        line = gs.growing_lines[0]
        gs.fail_line(line)
        assert gs.lives == initial_lives - 1
        assert len(gs.growing_lines) == 0
        assert gs.line_failed is True

    def test_fail_line_game_over_at_zero_lives(self):
        gs = self._make_state()
        gs.lives = 1
        gs.start_line(400, 300, "vertical")
        line = gs.growing_lines[0]
        gs.fail_line(line)
        assert gs.lives == 0
        assert gs.state == "lost"


# ===========================================================================
# Line-ball collision integration
# ===========================================================================

class TestLineBallCollisionIntegration:
    """Test the collision detection between growing lines and balls."""

    def test_ball_hits_growing_vertical_line(self):
        """A ball sitting on the path of a growing line should collide."""
        line = GrowingLine(
            start_x=400, start_y=300, direction="vertical",
            arm1_target=0, arm2_target=600,
        )
        line.grow(0.5)  # arms extend 100px each way
        ball = Ball(x=400, y=250, vx=0, vy=0, radius=10)

        segments = line.get_segments()
        hit = any(
            check_line_ball_collision(seg, ball) for seg in segments
        )
        assert hit is True

    def test_ball_misses_growing_line(self):
        """A ball far from the line should not collide."""
        line = GrowingLine(
            start_x=400, start_y=300, direction="vertical",
            arm1_target=0, arm2_target=600,
        )
        line.grow(0.1)
        ball = Ball(x=100, y=100, vx=0, vy=0, radius=10)

        segments = line.get_segments()
        hit = any(
            check_line_ball_collision(seg, ball) for seg in segments
        )
        assert hit is False

    def test_ball_near_but_not_touching(self):
        """Ball just outside collision radius should not register."""
        line = GrowingLine(
            start_x=400, start_y=300, direction="horizontal",
            arm1_target=0, arm2_target=800,
        )
        line.grow(0.5)
        # Ball at y=290, radius=8 → nearest point is y=300, distance=10 > 8
        ball = Ball(x=400, y=290, vx=0, vy=0, radius=8)

        segments = line.get_segments()
        hit = any(
            check_line_ball_collision(seg, ball) for seg in segments
        )
        assert hit is False

    def test_ball_barely_touching(self):
        """Ball whose edge just touches the line should collide."""
        line = GrowingLine(
            start_x=400, start_y=300, direction="horizontal",
            arm1_target=0, arm2_target=800,
        )
        line.grow(0.5)
        # Ball at y=290, radius=10 → distance to line=10, equals radius → touching
        ball = Ball(x=400, y=290, vx=0, vy=0, radius=10)

        segments = line.get_segments()
        hit = any(
            check_line_ball_collision(seg, ball) for seg in segments
        )
        assert hit is True


# ===========================================================================
# Boundary-aware target finding
# ===========================================================================

class TestBoundaryAwareTargets:
    """Lines should stop at the nearest boundary, not just the play area edge."""

    def _make_state(self) -> GameState:
        gs = GameState(width=800, height=600, num_balls=0)
        gs._clear_obstacles()
        gs.state = "playing"
        return gs

    def test_vertical_line_stops_at_horizontal_boundary(self):
        gs = self._make_state()
        # Add a horizontal boundary at y=200 spanning the full width
        gs.add_boundary(0, 200, 800, 200)
        gs.start_line(400, 300, "vertical")
        line = gs.growing_lines[0]
        # arm1 should target y=200 (not y=0)
        assert line.arm1_target == 200
        assert line.arm2_target == 600

    def test_horizontal_line_stops_at_vertical_boundary(self):
        gs = self._make_state()
        gs.add_boundary(600, 0, 600, 600)
        gs.start_line(400, 300, "horizontal")
        line = gs.growing_lines[0]
        assert line.arm1_target == 0
        assert line.arm2_target == 600  # stops at x=600, not x=800
