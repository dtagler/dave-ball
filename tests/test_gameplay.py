"""
End-to-end gameplay tests for the Dave Ball arcade game.

Simulates full game scenarios: line completion, line failure,
territory filling, win/loss conditions, multi-ball interactions,
direction toggling, and edge cases.

All tests are deterministic — ball positions and velocities are
set explicitly, not randomly generated.
"""

import pytest

from backend.game_state import GameState, GrowingLine
from backend.physics import Ball, check_line_ball_collision, update_ball_position
from backend.config import (
    BALL_RADIUS,
    BALL_SPEED,
    GRID_CELL_SIZE,
    INITIAL_LIVES,
    LINE_GROWTH_SPEED,
    WIN_FILL_PERCENT,
)

pytestmark = pytest.mark.gameplay


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_game(width=800, height=600, balls=None):
    """Create a GameState with controlled ball placements.

    *balls* is a list of (x, y, vx, vy) tuples.  If None, no balls
    are placed.
    """
    gs = GameState(width=width, height=height, num_balls=0)
    gs._clear_obstacles()
    gs.balls.clear()
    if balls:
        for x, y, vx, vy in balls:
            gs.balls.append(Ball(x, y, vx, vy, BALL_RADIUS))
    gs.state = "playing"
    return gs


def _tick(gs, dt=1 / 30):
    """Simulate one game tick: move balls, grow lines, check collisions."""
    for ball in gs.balls:
        update_ball_position(ball, dt, gs.boundaries)
    # Check line-ball collisions
    for line in list(gs.growing_lines):
        if not line.active:
            continue
        seg = line.get_full_segment()
        for ball in gs.balls:
            if check_line_ball_collision(seg, ball):
                gs.fail_line(line)
                break
    gs.grow_lines(dt)
    if gs.territory_recalc_needed:
        gs.recalculate_territory()


def _run_ticks(gs, n, dt=1 / 30):
    """Run *n* game ticks."""
    for _ in range(n):
        _tick(gs, dt)


# ===================================================================
# 1. Full game flow — successful line completion
# ===================================================================

class TestLineCompletion:
    """A line grows to both boundaries without being hit by a ball."""

    def test_vertical_line_completes_and_becomes_boundary(self):
        # Ball far away on the right, moving right (away from the line)
        gs = _make_game(balls=[(700, 300, 100, 0)])
        initial_boundary_count = len(gs.boundaries)

        # Start vertical line at x=100, well away from the ball
        assert gs.start_line(100, 300, "vertical")

        # Line needs to grow 300px up + 300px down = 300px max arm.
        # At 200 px/s and 1/30s ticks, each tick grows ~6.67px.
        # 300 / 6.67 ≈ 45 ticks should be more than enough.
        _run_ticks(gs, 60)

        assert len(gs.growing_lines) == 0, "Line should be removed after completion"
        assert len(gs.boundaries) > initial_boundary_count, "New boundary should exist"
        assert gs.line_completed, "line_completed flag should be set"

    def test_territory_recalculation_runs_after_completion(self):
        gs = _make_game(balls=[(700, 300, 100, 0)])
        gs.start_line(100, 300, "vertical")
        _run_ticks(gs, 60)
        # territory_recalc_needed should have been consumed
        assert not gs.territory_recalc_needed
        # Fill percentage should be non-zero (left side has no ball)
        assert gs.fill_percentage > 0

    def test_horizontal_line_completes(self):
        gs = _make_game(balls=[(400, 100, 0, -50)])
        assert gs.start_line(400, 400, "horizontal")
        _run_ticks(gs, 60)
        assert len(gs.growing_lines) == 0
        assert gs.line_completed


# ===================================================================
# 2. Line failure — ball hits growing line
# ===================================================================

class TestLineFailure:
    """A ball collides with a growing line, destroying it."""

    def test_ball_hits_vertical_line(self):
        # Ball at x=100, moving left toward x=50 where we'll draw
        gs = _make_game(balls=[(60, 300, -100, 0)])
        initial_lives = gs.lives
        gs.start_line(50, 300, "vertical")

        # Run ticks until line is failed or completes
        for _ in range(120):
            _tick(gs)
            if gs.line_failed:
                break

        assert gs.line_failed, "Ball should have hit the growing line"
        assert gs.lives == initial_lives - 1
        assert len(gs.growing_lines) == 0

    def test_ball_hits_horizontal_line(self):
        # Ball moving down toward y=300 where line grows
        gs = _make_game(balls=[(400, 290, 0, 100)])
        initial_lives = gs.lives
        gs.start_line(400, 300, "horizontal")

        for _ in range(120):
            _tick(gs)
            if gs.line_failed:
                break

        assert gs.line_failed
        assert gs.lives == initial_lives - 1

    def test_line_removed_on_failure(self):
        gs = _make_game(balls=[(52, 300, -100, 0)])
        initial_boundary_count = len(gs.boundaries)
        gs.start_line(50, 300, "vertical")

        for _ in range(120):
            _tick(gs)
            if gs.line_failed:
                break

        assert len(gs.boundaries) == initial_boundary_count, \
            "Failed line should NOT become a boundary"


# ===================================================================
# 3. Territory filling — enclosed region with no ball
# ===================================================================

class TestTerritoryFilling:
    """Completed lines that create ball-free regions cause filling."""

    def test_vertical_line_fills_ball_free_side(self):
        # Ball on the right side; vertical line near left edge
        gs = _make_game(balls=[(600, 300, 50, 50)])
        gs.start_line(100, 300, "vertical")
        _run_ticks(gs, 60)

        assert gs.fill_percentage > 0, "Ball-free side should be filled"
        assert len(gs.filled_regions) > 0

    def test_horizontal_line_fills_ball_free_side(self):
        # Ball in the top quarter; horizontal line in middle
        gs = _make_game(balls=[(400, 100, 50, -50)])
        gs.start_line(400, 200, "horizontal")
        _run_ticks(gs, 60)

        # The bottom 2/3 region has no ball → should be filled
        assert gs.fill_percentage > 0
        assert len(gs.filled_regions) > 0

    def test_fill_percentage_increases_with_second_line(self):
        # Ball pinned to top-right corner
        gs = _make_game(balls=[(700, 50, 50, -50)])

        gs.start_line(100, 300, "vertical")
        _run_ticks(gs, 60)
        fill_after_first = gs.fill_percentage

        gs.start_line(400, 300, "vertical")
        _run_ticks(gs, 60)
        fill_after_second = gs.fill_percentage

        assert fill_after_second >= fill_after_first, \
            "Second line should not decrease fill percentage"


# ===================================================================
# 4. Win condition — fill 80%
# ===================================================================

class TestWinCondition:
    """Game state becomes 'won' when fill_percentage ≥ 80%."""

    def test_win_by_filling_large_region(self):
        # Ball in a small corner; draw lines to isolate it
        gs = _make_game(width=800, height=600, balls=[(750, 50, 50, -50)])

        # Vertical line at x=100 — fills ~87.5% (left side: 100/800)
        # Actually left side is 0..100 out of 800, so 100/800 = 12.5% filled
        # We need the ball-free side to be ≥80%.
        # Ball is at x=750. A vertical line at x=160 isolates 160px left side
        # as ball-free = 160/800 = 20%. Not enough.
        # Line at x=640: left side = 640/800 = 80% — ball is on right side.
        gs.start_line(640, 300, "vertical")
        _run_ticks(gs, 60)

        assert gs.fill_percentage >= 80.0 or gs.state == "won", \
            f"Expected ≥80% or won, got {gs.fill_percentage}%"

    def test_state_becomes_won(self):
        # 400x400 area. Ball pinned far right; vertical line at x=340
        # isolates left 85% (ball-free) from right 15% (with ball).
        gs = _make_game(width=400, height=400, balls=[(380, 200, 10, 0)])

        gs.start_line(340, 200, "vertical")
        _run_ticks(gs, 120)

        # Left 340/400 = 85% should be filled → triggers win
        assert gs.fill_percentage >= 80.0
        assert gs.state == "won"


# ===================================================================
# 5. Loss condition — 0 lives
# ===================================================================

class TestLossCondition:
    """Game state becomes 'lost' when lives reach zero."""

    def test_last_life_lost_sets_state_lost(self):
        gs = _make_game(balls=[(55, 300, -150, 0)])
        gs.lives = 1

        gs.start_line(50, 300, "vertical")
        for _ in range(120):
            _tick(gs)
            if gs.state == "lost":
                break

        assert gs.state == "lost"
        assert gs.lives <= 0

    def test_multiple_failures_decrement_lives(self):
        gs = _make_game(balls=[(55, 300, -150, 0)])
        gs.lives = 3

        for attempt in range(3):
            gs.line_failed = False
            # Reset ball position for next attempt
            gs.balls[0].x = 55
            gs.balls[0].y = 300
            gs.balls[0].vx = -150
            gs.balls[0].vy = 0

            gs.start_line(50, 300, "vertical")
            for _ in range(120):
                _tick(gs)
                if gs.line_failed or gs.state == "lost":
                    break

        assert gs.lives <= 0
        assert gs.state == "lost"


# ===================================================================
# 6. Multiple balls, multiple regions
# ===================================================================

class TestMultipleBalls:
    """Multiple balls create regions that only fill where ball-free."""

    def test_three_balls_only_empty_region_fills(self):
        # Three balls spread across right half
        gs = _make_game(balls=[
            (500, 150, 30, 20),
            (600, 300, -20, 30),
            (700, 450, 20, -20),
        ])

        # Vertical line at x=100 — left 12.5% is ball-free
        gs.start_line(100, 300, "vertical")
        _run_ticks(gs, 60)

        assert gs.fill_percentage > 0, "Ball-free left region should fill"
        # The right side (with 3 balls) should NOT be filled
        assert gs.fill_percentage < 50, \
            "Region containing balls should not be filled"

    def test_two_lines_isolate_ball_regions(self):
        # Ball A in left quarter (stationary), Ball B in right quarter (stationary)
        # Using stationary balls to prevent them drifting into the middle
        gs = _make_game(balls=[
            (100, 300, 0, 0),
            (700, 300, 0, 0),
        ])

        # Vertical line at x=250 — both regions have a ball → fill stays 0
        gs.start_line(250, 300, "vertical")
        _run_ticks(gs, 60)
        fill_1 = gs.fill_percentage

        # Now vertical at x=550 — creates 3 regions:
        # [0..250] with ball A, [250..550] empty, [550..800] with ball B
        gs.start_line(550, 300, "vertical")
        _run_ticks(gs, 60)
        fill_2 = gs.fill_percentage

        assert fill_2 > fill_1, "Middle region (ball-free) should increase fill"


# ===================================================================
# 7. Direction toggle
# ===================================================================

class TestDirectionToggle:
    """Lines grow in the correct direction based on 'vertical'/'horizontal'."""

    def test_vertical_line_grows_up_and_down(self):
        gs = _make_game(balls=[(700, 300, 100, 0)])
        gs.start_line(100, 300, "vertical")

        line = gs.growing_lines[0]
        assert line.direction == "vertical"

        # After one tick, arms should have some progress
        line.grow(1 / 30)
        seg = line.get_full_segment()

        # Vertical: x stays constant, y values diverge
        assert seg["x1"] == seg["x2"] == 100
        assert seg["y1"] < 300, "Arm 1 should grow upward"
        assert seg["y2"] > 300, "Arm 2 should grow downward"

    def test_horizontal_line_grows_left_and_right(self):
        gs = _make_game(balls=[(400, 50, 0, -50)])
        gs.start_line(400, 300, "horizontal")

        line = gs.growing_lines[0]
        assert line.direction == "horizontal"

        line.grow(1 / 30)
        seg = line.get_full_segment()

        # Horizontal: y stays constant, x values diverge
        assert seg["y1"] == seg["y2"] == 300
        assert seg["x1"] < 400, "Arm 1 should grow leftward"
        assert seg["x2"] > 400, "Arm 2 should grow rightward"

    def test_invalid_direction_rejected(self):
        gs = _make_game(balls=[(400, 300, 100, 0)])
        assert not gs.start_line(400, 300, "diagonal")
        assert len(gs.growing_lines) == 0


# ===================================================================
# 8. Edge cases
# ===================================================================

class TestEdgeCases:
    """Boundary conditions and unusual configurations."""

    def test_line_at_boundary_edge_rejected(self):
        """Lines on the play-area border itself should be rejected."""
        gs = _make_game(balls=[(400, 300, 100, 0)])
        # On the top wall (y=0)
        assert not gs.start_line(400, 0, "horizontal")
        # On the left wall (x=0)
        assert not gs.start_line(0, 300, "vertical")
        # On the right wall (x=800)
        assert not gs.start_line(800, 300, "vertical")
        # On the bottom wall (y=600)
        assert not gs.start_line(400, 600, "horizontal")

    def test_line_just_inside_boundary(self):
        """Lines one pixel inside the border should be accepted."""
        gs = _make_game(balls=[(400, 300, 100, 0)])
        assert gs.start_line(1, 300, "vertical")
        gs.growing_lines.clear()
        assert gs.start_line(400, 1, "horizontal")

    def test_ball_on_boundary_does_not_crash(self):
        """A ball touching a boundary should not cause errors."""
        gs = _make_game(balls=[(BALL_RADIUS, 300, 100, 0)])
        # Ball is at x=BALL_RADIUS, right at the left wall
        # Should not crash during ticks
        _run_ticks(gs, 10)
        assert gs.state == "playing"

    def test_fast_ball_vs_slow_line(self):
        """A very fast ball should still be detected hitting a line."""
        # Ball at high speed moving toward line position
        gs = _make_game(balls=[(60, 300, -300, 0)])
        gs.lives = 5
        initial_lives = gs.lives

        gs.start_line(50, 300, "vertical")
        for _ in range(120):
            _tick(gs)
            if gs.line_failed:
                break

        # The fast ball should still collide (within tick resolution)
        assert gs.line_failed
        assert gs.lives < initial_lives

    def test_only_one_line_at_a_time(self):
        """MAX_GROWING_LINES=1 means second line is rejected."""
        gs = _make_game(balls=[(400, 300, 100, 0)])
        assert gs.start_line(100, 300, "vertical")
        assert not gs.start_line(200, 300, "vertical"), \
            "Second simultaneous line should be rejected"

    def test_line_after_previous_completes(self):
        """After a line completes, a new line can be started."""
        gs = _make_game(balls=[(700, 300, 100, 0)])
        gs.start_line(100, 300, "vertical")
        _run_ticks(gs, 60)
        assert len(gs.growing_lines) == 0

        # Now a second line should be accepted
        assert gs.start_line(200, 300, "vertical")

    def test_stationary_ball_not_hit_by_distant_line(self):
        """A stationary ball far from a line should not trigger failure."""
        gs = _make_game(balls=[(700, 300, 0, 0)])
        gs.start_line(100, 300, "vertical")
        _run_ticks(gs, 60)

        assert not gs.line_failed
        assert gs.line_completed

    def test_game_state_serialization_after_play(self):
        """to_dict() should succeed after lines, fills, and state changes."""
        gs = _make_game(balls=[(700, 300, 50, 50)])
        gs.start_line(100, 300, "vertical")
        _run_ticks(gs, 60)

        d = gs.to_dict()
        assert isinstance(d, dict)
        assert "fill_percentage" in d
        assert "state" in d
        assert d["fill_percentage"] > 0
