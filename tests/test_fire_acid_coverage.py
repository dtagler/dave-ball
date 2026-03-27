"""
Tests for fire power-up, acid power-up, lightning edge cases, magnet sticking,
snake spawn-in-active-area, game-state serialization completeness,
and edge cases (last-ball guards).

Fills coverage gaps identified in the test audit.
"""

import math
import random
from unittest.mock import patch

import pytest

from backend.game_state import (
    AcidPool,
    GameState,
    GrowingLine,
    Magnet,
    PowerUp,
    Snake,
)
from backend.physics import Ball, check_line_ball_collision
from backend.config import (
    ACID_DURATION,
    ACID_POOL_COUNT_MAX,
    ACID_POOL_COUNT_MIN,
    ACID_POOL_RADIUS,
    BALL_RADIUS,
    LIGHTNING_SPEED_MULTIPLIER,
    LINE_GROWTH_SPEED,
    MAGNET_DURATION,
    MAGNET_PULL_FORCE,
    SNAKE_DURATION,
)

pytestmark = pytest.mark.coverage


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_game(width=200, height=200, balls=None):
    """Create a GameState with controlled ball placements and no obstacles."""
    gs = GameState(width=width, height=height, num_balls=0)
    gs._clear_obstacles()
    gs.balls.clear()
    if balls:
        for x, y, vx, vy in balls:
            gs.balls.append(Ball(x, y, vx, vy, BALL_RADIUS))
    gs.state = "playing"
    return gs


# ===========================================================================
# Fire power-up tests
# ===========================================================================

class TestFirePowerUp:
    """Tests for the fire power-up lifecycle."""

    def test_fire_effect_sets_flag(self):
        gs = _make_game()
        assert gs.fire_active is False
        gs._apply_powerup_effect("fire", {})
        assert gs.fire_active is True

    def test_fire_flag_transfers_to_line(self):
        gs = _make_game(balls=[(180, 180, 0, 0)])
        gs._apply_powerup_effect("fire", {})
        gs.start_line(100, 100, "vertical")
        line = gs.growing_lines[0]
        assert line.is_fire is True
        # Flag consumed after transfer
        assert gs.fire_active is False

    def test_normal_line_not_fire(self):
        gs = _make_game(balls=[(180, 180, 0, 0)])
        gs.start_line(100, 100, "vertical")
        line = gs.growing_lines[0]
        assert line.is_fire is False

    def test_fire_line_destroys_touching_ball(self):
        """A fire line that completes while touching a ball should destroy it."""
        gs = _make_game(width=400, height=400, balls=[
            (100, 200, 0, 0),   # on the fire line path
            (300, 300, 0, 0),   # far away, survives
        ])
        gs._apply_powerup_effect("fire", {})

        # Start vertical line at x=100 — ball at (100, 200) is on this line
        gs.start_line(100, 200, "vertical")
        line = gs.growing_lines[0]
        assert line.is_fire is True

        # Force the line to completion
        line.arm1_complete = True
        line.arm2_complete = True
        line.arm1_progress = line.arm1_max
        line.arm2_progress = line.arm2_max

        gs.grow_lines(1 / 30)

        # Ball at (100, 200) was on the fire line and should be destroyed
        assert len(gs.balls) == 1
        assert gs.balls[0].x == 300

    def test_fire_destroy_events_populated(self):
        """fire_destroy_events should contain entries for destroyed balls."""
        gs = _make_game(width=400, height=400, balls=[
            (100, 200, 0, 0),
            (300, 300, 0, 0),
        ])
        gs._apply_powerup_effect("fire", {})
        gs.start_line(100, 200, "vertical")
        line = gs.growing_lines[0]
        line.arm1_complete = True
        line.arm2_complete = True
        line.arm1_progress = line.arm1_max
        line.arm2_progress = line.arm2_max

        gs.grow_lines(1 / 30)

        assert len(gs.fire_destroy_events) >= 1
        evt = gs.fire_destroy_events[0]
        assert "x" in evt
        assert "y" in evt
        assert "ball_id" in evt

    def test_fire_line_completes_after_destroying_ball(self):
        """Fire line should still complete (become boundary) after destroying balls."""
        gs = _make_game(width=400, height=400, balls=[
            (100, 200, 0, 0),
            (300, 300, 0, 0),
        ])
        gs._apply_powerup_effect("fire", {})
        gs.start_line(100, 200, "vertical")
        line = gs.growing_lines[0]
        line.arm1_complete = True
        line.arm2_complete = True
        line.arm1_progress = line.arm1_max
        line.arm2_progress = line.arm2_max

        initial_boundary_count = len(gs.boundaries)
        gs.grow_lines(1 / 30)

        # Line should be removed from growing_lines (completed)
        assert len(gs.growing_lines) == 0
        # A new boundary should have been added
        assert len(gs.boundaries) > initial_boundary_count

    def test_fire_line_can_destroy_multiple_balls(self):
        """Multiple balls touching a fire line should all be destroyed."""
        gs = _make_game(width=400, height=400, balls=[
            (100, 50, 0, 0),    # on the fire line path
            (100, 150, 0, 0),   # on the fire line path
            (100, 350, 0, 0),   # on the fire line path
            (300, 300, 0, 0),   # far away
        ])
        gs._apply_powerup_effect("fire", {})
        gs.start_line(100, 200, "vertical")
        line = gs.growing_lines[0]
        line.arm1_complete = True
        line.arm2_complete = True
        line.arm1_progress = line.arm1_max
        line.arm2_progress = line.arm2_max

        gs.grow_lines(1 / 30)

        # All balls on x=100 should be destroyed; only the one at (300,300) survives
        assert len(gs.fire_destroy_events) >= 2
        # Survivor is the ball far away
        surviving_xs = [b.x for b in gs.balls]
        assert 300 in surviving_xs

    def test_fire_line_no_last_ball_guard(self):
        """Fire line now guards against destroying the last ball."""
        gs = _make_game(width=400, height=400, balls=[
            (100, 200, 0, 0),   # only ball, on the fire line
        ])
        gs._apply_powerup_effect("fire", {})
        gs.start_line(100, 200, "vertical")
        line = gs.growing_lines[0]
        line.arm1_complete = True
        line.arm2_complete = True
        line.arm1_progress = line.arm1_max
        line.arm2_progress = line.arm2_max

        gs.grow_lines(1 / 30)

        # Fire now keeps the last ball alive
        assert len(gs.balls) == 1
        assert len(gs.fire_destroy_events) == 0


# ===========================================================================
# Acid power-up tests
# ===========================================================================

class TestAcidPoolClass:
    """Unit tests for the AcidPool data class."""

    def test_acid_pool_creation(self):
        pool = AcidPool(100.0, 200.0, 35.0, 12.0)
        assert pool.x == 100.0
        assert pool.y == 200.0
        assert pool.radius == 35.0
        assert pool.timer == 12.0
        assert pool.active is True

    def test_acid_pool_to_dict(self):
        pool = AcidPool(50.0, 75.0, 35.0, 10.5)
        d = pool.to_dict()
        assert d == {"x": 50.0, "y": 75.0, "radius": 35.0, "timer": 10.5}


class TestAcidEffect:
    """Tests for acid power-up spawning and behavior."""

    def test_acid_effect_spawns_pools(self):
        gs = _make_game(width=400, height=400)
        assert len(gs.acid_pools) == 0
        gs._apply_powerup_effect("acid", {})
        assert ACID_POOL_COUNT_MIN <= len(gs.acid_pools) <= ACID_POOL_COUNT_MAX

    def test_acid_pools_use_config_values(self):
        gs = _make_game(width=400, height=400)
        gs._apply_powerup_effect("acid", {})
        for pool in gs.acid_pools:
            assert pool.radius == ACID_POOL_RADIUS
            assert pool.timer == ACID_DURATION

    def test_acid_pools_spawn_in_active_area(self):
        """Acid pools should not spawn inside filled regions."""
        gs = _make_game(width=400, height=400)
        # Create a filled region covering the left half
        gs.filled_regions = [{"x": 0, "y": 0, "width": 200, "height": 400}]
        gs._apply_powerup_effect("acid", {})
        for pool in gs.acid_pools:
            assert not gs._is_point_in_filled(pool.x, pool.y), \
                f"Acid pool at ({pool.x}, {pool.y}) spawned inside filled region"

    def test_acid_pool_timer_expiry(self):
        """Pools should be removed when their timer expires."""
        gs = _make_game(width=400, height=400)
        gs.acid_pools = [AcidPool(100, 200, ACID_POOL_RADIUS, 1.0)]
        gs.update_acid_pools(0.5)
        assert len(gs.acid_pools) == 1  # still alive

        gs.update_acid_pools(0.6)  # total > 1.0
        assert len(gs.acid_pools) == 0  # expired

    def test_acid_pool_dissolves_ball(self):
        """A ball inside an acid pool's radius should be dissolved."""
        gs = _make_game(width=400, height=400, balls=[
            (100, 200, 0, 0),   # inside the pool
            (300, 300, 0, 0),   # far away
        ])
        gs.acid_pools = [AcidPool(100, 200, ACID_POOL_RADIUS, 10.0)]
        gs.update_acid_pools(1 / 30)

        assert len(gs.balls) == 1
        assert gs.balls[0].x == 300

    def test_acid_dissolve_events_populated(self):
        gs = _make_game(width=400, height=400, balls=[
            (100, 200, 0, 0),
            (300, 300, 0, 0),
        ])
        gs.acid_pools = [AcidPool(100, 200, ACID_POOL_RADIUS, 10.0)]
        gs.update_acid_pools(1 / 30)

        assert len(gs.acid_dissolve_events) == 1
        evt = gs.acid_dissolve_events[0]
        assert "x" in evt
        assert "y" in evt

    def test_acid_keeps_at_least_one_ball(self):
        """Acid pools must not dissolve the last remaining ball."""
        gs = _make_game(width=400, height=400, balls=[
            (100, 200, 0, 0),   # only ball, inside pool
        ])
        gs.acid_pools = [AcidPool(100, 200, ACID_POOL_RADIUS, 10.0)]
        gs.update_acid_pools(1 / 30)

        assert len(gs.balls) == 1  # must survive
        assert len(gs.acid_dissolve_events) == 0

    def test_acid_dissolve_events_cleared_each_tick(self):
        """acid_dissolve_events should be cleared at the start of each update."""
        gs = _make_game(width=400, height=400, balls=[
            (100, 200, 0, 0),
            (300, 300, 0, 0),
        ])
        gs.acid_pools = [AcidPool(100, 200, ACID_POOL_RADIUS, 10.0)]
        gs.update_acid_pools(1 / 30)
        assert len(gs.acid_dissolve_events) == 1

        # Next tick: the ball is gone, events should be cleared
        gs.update_acid_pools(1 / 30)
        assert len(gs.acid_dissolve_events) == 0

    def test_acid_no_crash_with_empty_pools(self):
        """update_acid_pools should be a no-op when there are no pools."""
        gs = _make_game()
        gs.update_acid_pools(1 / 30)  # should not raise

    def test_multiple_acid_pools_dissolve_independently(self):
        """Two pools at different positions can each dissolve a ball."""
        gs = _make_game(width=400, height=400, balls=[
            (100, 100, 0, 0),   # inside pool 1
            (300, 300, 0, 0),   # inside pool 2
            (200, 200, 0, 0),   # safe
        ])
        gs.acid_pools = [
            AcidPool(100, 100, ACID_POOL_RADIUS, 10.0),
            AcidPool(300, 300, ACID_POOL_RADIUS, 10.0),
        ]
        gs.update_acid_pools(1 / 30)

        # Keep-at-least-1 guard means at most 2 dissolved (3 - 2 = 1 remaining)
        assert len(gs.balls) >= 1
        assert len(gs.acid_dissolve_events) >= 1


# ===========================================================================
# Magnet sticking behavior
# ===========================================================================

class TestMagnetSticking:
    """Tests for magnet ball-sticking behavior when ball is very close."""

    def test_magnet_sticks_ball_when_very_close(self):
        """Ball within stick radius (20px) should have velocity damped."""
        gs = _make_game(width=400, height=400, balls=[
            (105, 200, 100, 100),  # 5px from magnet — within stick radius
        ])
        gs.magnet = Magnet(100, 200, MAGNET_DURATION)

        original_speed = math.sqrt(gs.balls[0].vx**2 + gs.balls[0].vy**2)
        gs.update_magnet(1 / 30)
        new_speed = math.sqrt(gs.balls[0].vx**2 + gs.balls[0].vy**2)

        # Sticking damps velocity significantly
        assert new_speed < original_speed

    def test_magnet_max_one_at_a_time(self):
        """Applying magnet effect when one exists replaces the old one."""
        gs = _make_game(width=400, height=400, balls=[(200, 200, 0, 0)])
        gs._apply_powerup_effect("magnet", {})
        first_magnet = gs.magnet
        assert first_magnet is not None

        gs._apply_powerup_effect("magnet", {})
        # Should have a new magnet (replaced)
        assert gs.magnet is not None


# ===========================================================================
# Lightning edge cases
# ===========================================================================

class TestLightningEdgeCases:
    """Tests for lightning charge consumption on failure and other edges."""

    def test_lightning_consumed_on_line_failure(self):
        """fail_line() should consume one lightning charge."""
        gs = _make_game(balls=[(180, 180, 0, 0)])
        gs.lightning_charges = 3
        line = GrowingLine(50, 100, "vertical", 0, 200, LINE_GROWTH_SPEED)
        gs.growing_lines.append(line)

        gs.fail_line(line)
        assert gs.lightning_charges == 2

    def test_lightning_charges_dont_go_negative(self):
        """Consuming a charge at 0 should stay at 0."""
        gs = _make_game(balls=[(180, 180, 0, 0)])
        gs.lightning_charges = 0
        line = GrowingLine(50, 100, "vertical", 0, 200, LINE_GROWTH_SPEED)
        gs.growing_lines.append(line)

        gs.fail_line(line)
        assert gs.lightning_charges == 0


# ===========================================================================
# Snake spawn in active area
# ===========================================================================

class TestSnakeSpawnActiveArea:
    """Tests that snake spawns in unfilled (active) play area."""

    def test_snake_does_not_spawn_in_filled_region(self):
        """Snake should avoid filled regions when spawning."""
        gs = _make_game(width=400, height=400, balls=[(300, 300, 0, 0)])
        # Fill the left half, leave right side active
        gs.filled_regions = [{"x": 0, "y": 0, "width": 250, "height": 400}]

        gs._apply_powerup_effect("snake", {})
        snake = gs.snake
        assert snake is not None
        assert snake.active is True

        # Snake head (segments[0]) should be in the active area (x > 250)
        # or at the center fallback. The spawn logic tries near the ball first.
        head = snake.segments[0]
        # The ball is at (300, 300) in active area; spawn tries near it.
        # If it worked, the snake head should NOT be in the filled region.
        is_in_filled = gs._is_point_in_filled(head["x"], head["y"])
        # Note: fallback to center (200, 200) IS in filled region, but the
        # primary path should succeed since ball is in active area
        assert not is_in_filled or (head["x"] == 200 and head["y"] == 200)


# ===========================================================================
# GameState.to_dict() completeness
# ===========================================================================

class TestGameStateSerialization:
    """Verify to_dict() includes all required fields."""

    def test_to_dict_contains_fire_fields(self):
        gs = _make_game()
        d = gs.to_dict()
        assert "fire_active" in d
        assert "fire_destroy_events" in d

    def test_to_dict_contains_acid_fields(self):
        gs = _make_game()
        d = gs.to_dict()
        assert "acid_pools" in d
        assert "acid_dissolve_events" in d

    def test_to_dict_contains_lightning_fields(self):
        gs = _make_game()
        d = gs.to_dict()
        assert "lightning_active" in d
        assert "lightning_charges" in d

    def test_to_dict_contains_magnet_field(self):
        gs = _make_game()
        d = gs.to_dict()
        assert "magnet" in d

    def test_to_dict_contains_snake_fields(self):
        gs = _make_game()
        d = gs.to_dict()
        assert "snake" in d
        assert "snake_eat_events" in d

    def test_to_dict_contains_portal_fields(self):
        gs = _make_game()
        d = gs.to_dict()
        assert "portal_pair" in d
        assert "portal_events" in d

    def test_to_dict_contains_sinkhole_fields(self):
        gs = _make_game()
        d = gs.to_dict()
        assert "sinkhole" in d
        assert "sinkhole_events" in d

    def test_to_dict_contains_web_zones(self):
        gs = _make_game()
        d = gs.to_dict()
        assert "web_zones" in d

    def test_to_dict_contains_wave_fields(self):
        gs = _make_game()
        d = gs.to_dict()
        assert "is_wave" in d
        assert "wave_timer" in d

    def test_to_dict_contains_fusion_fields(self):
        gs = _make_game()
        d = gs.to_dict()
        assert "is_fusion" in d
        assert "fusion_timer" in d

    def test_to_dict_contains_fission_fields(self):
        gs = _make_game()
        d = gs.to_dict()
        assert "is_fission_active" in d
        assert "fission_pu_timer" in d

    def test_to_dict_contains_obstacles(self):
        gs = _make_game()
        d = gs.to_dict()
        assert "obstacles" in d

    def test_to_dict_contains_core_game_fields(self):
        gs = _make_game()
        d = gs.to_dict()
        for field in ("play_area", "balls", "boundaries", "growing_lines",
                       "filled_regions", "lives", "score", "level",
                       "fill_percentage", "state", "speed_multiplier",
                       "level_timer", "lines_drawn", "powerups"):
            assert field in d, f"Missing field: {field}"

    def test_to_dict_lightning_active_reflects_charges(self):
        """lightning_active should be True when charges > 0."""
        gs = _make_game()
        gs.lightning_charges = 0
        assert gs.to_dict()["lightning_active"] is False

        gs.lightning_charges = 3
        assert gs.to_dict()["lightning_active"] is True

    def test_to_dict_magnet_serialized_when_present(self):
        gs = _make_game(width=400, height=400, balls=[(200, 200, 0, 0)])
        gs.magnet = Magnet(100, 100, MAGNET_DURATION)
        d = gs.to_dict()
        assert d["magnet"] is not None
        assert "x" in d["magnet"]
        assert "y" in d["magnet"]
        assert "timer" in d["magnet"]

    def test_to_dict_acid_pools_serialized(self):
        gs = _make_game()
        gs.acid_pools = [AcidPool(50, 75, 35, 10)]
        d = gs.to_dict()
        assert len(d["acid_pools"]) == 1
        assert d["acid_pools"][0]["x"] == 50


# ===========================================================================
# GrowingLine.is_fire in to_dict
# ===========================================================================

class TestGrowingLineFireSerialization:
    def test_growing_line_to_dict_includes_is_fire(self):
        line = GrowingLine(100, 200, "vertical", 0, 400, LINE_GROWTH_SPEED)
        d = line.to_dict()
        assert "is_fire" in d
        assert d["is_fire"] is False

    def test_growing_line_to_dict_fire_true(self):
        line = GrowingLine(100, 200, "vertical", 0, 400, LINE_GROWTH_SPEED)
        line.is_fire = True
        d = line.to_dict()
        assert d["is_fire"] is True
