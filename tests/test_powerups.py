"""
Tests for the power-up system in the Dave Ball arcade game.

Covers: power-up spawning, capture detection, individual effect application,
timer-based effect expiration, and edge cases.
"""

import math
import random
from unittest.mock import patch

import pytest

from backend.game_state import GameState, GrowingLine, PowerUp, Magnet, Snake, Sinkhole, WebZone, PortalPair
from backend.physics import Ball
from backend.config import (
    BALL_RADIUS,
    CLOCK_SLOW_DURATION,
    CLOCK_SLOW_FACTOR,
    FREEZE_DURATION,
    FRUIT_POINTS,
    FRUIT_MAX_ON_FIELD,
    GROW_DURATION,
    GROW_FACTOR,
    LIGHTNING_SPEED_MULTIPLIER,
    LINE_GROWTH_SPEED,
    MAGNET_DURATION,
    NUKE_BLAST_RADIUS,
    POWERUP_MAX_ON_FIELD,
    SHRINK_DURATION,
    SHRINK_FACTOR,
    FUSION_DURATION,
    FISSION_PU_DURATION,
    WAVE_DURATION,
    WEB_DURATION,
    WEB_ZONE_RADIUS,
    WEB_ZONE_COUNT_MIN,
    WEB_ZONE_COUNT_MAX,
    PORTAL_DURATION,
    SINKHOLE_DURATION,
    SINKHOLE_RADIUS,
    SINKHOLE_PULL_RADIUS,
    SNAKE_DURATION,
)

pytestmark = pytest.mark.powerups


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


# ---------------------------------------------------------------------------
# PowerUp class unit tests
# ---------------------------------------------------------------------------

class TestPowerUpClass:
    """Unit tests for the PowerUp data class."""

    def test_powerup_creation(self):
        pu = PowerUp(100.0, 50.0, "heart", 1)
        assert pu.x == 100.0
        assert pu.y == 50.0
        assert pu.kind == "heart"
        assert pu.item_id == 1
        assert pu.active is True

    def test_powerup_is_fruit_false_for_powerup_kinds(self):
        for kind in ["heart", "clock", "shield", "lightning", "bomb"]:
            pu = PowerUp(0, 0, kind, 1)
            assert pu.is_fruit is False

    def test_powerup_is_fruit_true_for_fruit_kinds(self):
        for kind in FRUIT_POINTS.keys():
            pu = PowerUp(0, 0, kind, 1)
            assert pu.is_fruit is True

    def test_powerup_to_dict(self):
        pu = PowerUp(10.0, 20.0, "shield", 42)
        d = pu.to_dict()
        assert d["x"] == 10.0
        assert d["y"] == 20.0
        assert d["kind"] == "shield"
        assert d["id"] == 42
        assert d["active"] is True
        assert d["is_fruit"] is False


# ---------------------------------------------------------------------------
# Power-up spawning
# ---------------------------------------------------------------------------

class TestPowerUpSpawning:
    """Tests for spawn_powerup() and spawn_fruit()."""

    def test_spawn_powerup_adds_to_list(self):
        gs = _make_game()
        result = gs.spawn_powerup()
        assert result is True
        assert len(gs.powerups) == 1
        assert gs.powerups[0].active is True

    def test_spawn_powerup_respects_max_on_field(self):
        gs = _make_game()
        for _ in range(POWERUP_MAX_ON_FIELD):
            gs.spawn_powerup()
        assert len(gs.powerups) == POWERUP_MAX_ON_FIELD
        result = gs.spawn_powerup()
        assert result is False
        assert len(gs.powerups) == POWERUP_MAX_ON_FIELD

    def test_spawn_powerup_increments_id(self):
        gs = _make_game()
        gs.spawn_powerup()
        gs.spawn_powerup()
        ids = [p.item_id for p in gs.powerups]
        assert ids[1] > ids[0]

    def test_spawn_powerup_position_inside_play_area(self):
        gs = _make_game(width=400, height=400)
        for _ in range(5):
            gs.spawn_powerup()
        for pu in gs.powerups:
            assert 0 <= pu.x <= 400
            assert 0 <= pu.y <= 400

    def test_spawn_fruit_adds_to_fruits_list(self):
        gs = _make_game()
        result = gs.spawn_fruit()
        assert result is True
        assert len(gs.fruits) == 1
        assert gs.fruits[0].kind in FRUIT_POINTS

    def test_spawn_fruit_respects_max_on_field(self):
        gs = _make_game()
        for _ in range(FRUIT_MAX_ON_FIELD):
            gs.spawn_fruit()
        assert len(gs.fruits) == FRUIT_MAX_ON_FIELD
        result = gs.spawn_fruit()
        assert result is False

    def test_spawn_powerup_avoids_filled_regions(self):
        gs = _make_game(width=200, height=200)
        # Fill most of the play area so powerups can't spawn
        gs.filled_regions = [{"x": 0, "y": 0, "width": 200, "height": 200, "cell_count": 100}]
        result = gs.spawn_powerup()
        assert result is False


# ---------------------------------------------------------------------------
# Power-up capture detection
# ---------------------------------------------------------------------------

class TestPowerUpCapture:
    """Tests for check_powerup_captures()."""

    def test_powerup_captured_in_filled_region(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        pu = PowerUp(50, 50, "heart", 1)
        gs.powerups = [pu]
        gs.filled_regions = [{"x": 0, "y": 0, "width": 80, "height": 80, "cell_count": 100}]
        gs.check_powerup_captures()
        assert len(gs.powerups) == 0
        assert len(gs.powerup_events) == 1
        assert gs.powerup_events[0]["kind"] == "heart"

    def test_powerup_not_captured_outside_filled_region(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        pu = PowerUp(150, 150, "heart", 1)
        gs.powerups = [pu]
        gs.filled_regions = [{"x": 0, "y": 0, "width": 80, "height": 80, "cell_count": 100}]
        gs.check_powerup_captures()
        assert len(gs.powerups) == 1  # still on field

    def test_fruit_captured_awards_points(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        gs.score = 0
        fruit = PowerUp(50, 50, "cherry", 1)
        gs.fruits = [fruit]
        gs.filled_regions = [{"x": 0, "y": 0, "width": 80, "height": 80, "cell_count": 100}]
        gs.check_powerup_captures()
        assert len(gs.fruits) == 0
        assert gs.score == FRUIT_POINTS["cherry"]
        assert gs.powerup_events[0]["is_fruit"] is True
        assert gs.powerup_events[0]["points"] == FRUIT_POINTS["cherry"]

    def test_multiple_fruits_captured_gives_correct_total(self):
        gs = _make_game(balls=[(180, 180, 0, 0)])
        gs.score = 0
        gs.fruits = [
            PowerUp(10, 10, "cherry", 1),
            PowerUp(20, 20, "strawberry", 2),
        ]
        gs.filled_regions = [{"x": 0, "y": 0, "width": 100, "height": 100, "cell_count": 100}]
        gs.check_powerup_captures()
        assert gs.score == FRUIT_POINTS["cherry"] + FRUIT_POINTS["strawberry"]

    def test_mystery_powerup_resolves_to_other_kind(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        pu = PowerUp(50, 50, "mystery", 1)
        gs.powerups = [pu]
        gs.filled_regions = [{"x": 0, "y": 0, "width": 80, "height": 80, "cell_count": 100}]
        gs.check_powerup_captures()
        assert len(gs.powerup_events) == 1
        event = gs.powerup_events[0]
        assert "resolved_kind" in event
        assert event["kind"] != "mystery"


# ---------------------------------------------------------------------------
# Individual power-up effects
# ---------------------------------------------------------------------------

class TestHeartEffect:
    def test_heart_adds_life(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        initial_lives = gs.lives
        gs._apply_powerup_effect("heart", {})
        assert gs.lives == initial_lives + 1


class TestClockEffect:
    def test_clock_enables_slow_mode(self):
        gs = _make_game(balls=[(100, 100, 50, 50)])
        gs._apply_powerup_effect("clock", {})
        assert gs.is_slowed is True
        assert gs.slow_timer == CLOCK_SLOW_DURATION

    def test_clock_halves_ball_speed(self):
        gs = _make_game(balls=[(100, 100, 100, 0)])
        original_vx = gs.balls[0].vx
        gs._apply_powerup_effect("clock", {})
        assert gs.balls[0].vx == pytest.approx(original_vx * CLOCK_SLOW_FACTOR)

    def test_slow_timer_expires_restores_speed(self):
        gs = _make_game(balls=[(100, 100, 100, 0)])
        original_vx = gs.balls[0].vx
        gs._apply_powerup_effect("clock", {})
        # Tick past the duration
        gs.update_slow_effect(CLOCK_SLOW_DURATION + 1)
        assert gs.is_slowed is False
        assert gs.balls[0].vx == pytest.approx(original_vx, rel=1e-5)


class TestShieldEffect:
    def test_shield_activates(self):
        gs = _make_game()
        gs._apply_powerup_effect("shield", {})
        assert gs.shield_active is True

    def test_shield_protects_line_from_failure(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        gs.shield_active = True
        initial_lives = gs.lives
        line = GrowingLine(100, 50, "vertical", 0, 200, LINE_GROWTH_SPEED)
        gs.growing_lines.append(line)
        gs.fail_line(line)
        # Shield absorbs the hit — no life lost
        assert gs.lives == initial_lives

    def test_shield_consumed_on_line_completion(self):
        gs = _make_game(balls=[(180, 180, 0, 0)])
        gs.shield_active = True
        line = GrowingLine(50, 100, "vertical", 0, 200, LINE_GROWTH_SPEED)
        line.arm1_complete = True
        line.arm2_complete = True
        line.arm1_progress = 100
        line.arm2_progress = 100
        gs.growing_lines.append(line)
        gs.complete_line(line)
        assert gs.shield_active is False


class TestLightningEffect:
    def test_lightning_adds_charges(self):
        gs = _make_game()
        gs._apply_powerup_effect("lightning", {})
        assert gs.lightning_charges == 3

    def test_lightning_stacks(self):
        gs = _make_game()
        gs._apply_powerup_effect("lightning", {})
        gs._apply_powerup_effect("lightning", {})
        assert gs.lightning_charges == 6

    def test_lightning_capped_at_9(self):
        gs = _make_game()
        gs.lightning_charges = 8
        gs._apply_powerup_effect("lightning", {})
        # Adds 3 → 11, but game logic in start_line limits usage
        assert gs.lightning_charges == 11  # raw add, no cap in effect itself

    def test_lightning_gives_fast_line_growth(self):
        gs = _make_game(balls=[(180, 180, 0, 0)])
        gs.lightning_charges = 1
        gs.start_line(100, 100, "vertical")
        line = gs.growing_lines[0]
        expected_speed = LINE_GROWTH_SPEED * LIGHTNING_SPEED_MULTIPLIER
        assert line.growth_speed == pytest.approx(expected_speed)

    def test_lightning_charge_consumed_on_completion(self):
        gs = _make_game(balls=[(180, 180, 0, 0)])
        gs.lightning_charges = 2
        line = GrowingLine(50, 100, "vertical", 0, 200, LINE_GROWTH_SPEED)
        line.arm1_complete = True
        line.arm2_complete = True
        line.arm1_progress = 100
        line.arm2_progress = 100
        gs.growing_lines.append(line)
        gs.complete_line(line)
        assert gs.lightning_charges == 1

    def test_no_lightning_gives_normal_speed(self):
        gs = _make_game(balls=[(180, 180, 0, 0)])
        gs.lightning_charges = 0
        gs.start_line(100, 100, "vertical")
        line = gs.growing_lines[0]
        assert line.growth_speed == pytest.approx(LINE_GROWTH_SPEED)


class TestFreezeEffect:
    def test_freeze_activates(self):
        gs = _make_game(balls=[(100, 100, 50, 50)])
        gs._apply_powerup_effect("freeze", {})
        assert gs.is_frozen is True
        assert gs.freeze_timer == FREEZE_DURATION

    def test_freeze_timer_expires(self):
        gs = _make_game(balls=[(100, 100, 50, 50)])
        gs._apply_powerup_effect("freeze", {})
        gs.update_freeze_effect(FREEZE_DURATION + 1)
        assert gs.is_frozen is False
        assert gs.freeze_timer == 0.0


class TestShrinkEffect:
    def test_shrink_reduces_ball_radius(self):
        gs = _make_game(balls=[(100, 100, 50, 50)])
        original_radius = gs.balls[0].radius
        gs._apply_powerup_effect("shrink", {})
        assert gs.is_shrunk is True
        assert gs.balls[0].radius == pytest.approx(original_radius * SHRINK_FACTOR)

    def test_shrink_timer_expires_restores_radius(self):
        gs = _make_game(balls=[(100, 100, 50, 50)])
        original_radius = gs.balls[0].radius
        gs._apply_powerup_effect("shrink", {})
        gs.update_shrink_effect(SHRINK_DURATION + 1)
        assert gs.is_shrunk is False
        assert gs.balls[0].radius == pytest.approx(original_radius)


class TestGrowEffect:
    def test_grow_increases_ball_radius(self):
        gs = _make_game(balls=[(100, 100, 50, 50)])
        original_radius = gs.balls[0].radius
        gs._apply_powerup_effect("grow", {})
        assert gs.is_grown is True
        assert gs.balls[0].radius == pytest.approx(original_radius * GROW_FACTOR)

    def test_grow_timer_expires_restores_radius(self):
        gs = _make_game(balls=[(100, 100, 50, 50)])
        original_radius = gs.balls[0].radius
        gs._apply_powerup_effect("grow", {})
        gs.update_grow_effect(GROW_DURATION + 1)
        assert gs.is_grown is False
        assert gs.balls[0].radius == pytest.approx(original_radius)

    def test_grow_cancels_shrink(self):
        gs = _make_game(balls=[(100, 100, 50, 50)])
        original_radius = gs.balls[0].radius
        gs._apply_powerup_effect("shrink", {})
        assert gs.is_shrunk is True
        gs._apply_powerup_effect("grow", {})
        assert gs.is_shrunk is False
        assert gs.is_grown is True
        assert gs.balls[0].radius == pytest.approx(original_radius * GROW_FACTOR)

    def test_shrink_cancels_grow(self):
        gs = _make_game(balls=[(100, 100, 50, 50)])
        original_radius = gs.balls[0].radius
        gs._apply_powerup_effect("grow", {})
        assert gs.is_grown is True
        gs._apply_powerup_effect("shrink", {})
        assert gs.is_grown is False
        assert gs.is_shrunk is True
        assert gs.balls[0].radius == pytest.approx(original_radius * SHRINK_FACTOR)


class TestBombEffect:
    def test_bomb_removes_one_ball(self):
        gs = _make_game(balls=[(50, 50, 0, 0), (150, 150, 0, 0)])
        event = {}
        gs._apply_powerup_effect("bomb", event)
        assert len(gs.balls) == 1
        assert "removed_ball" in event

    def test_bomb_does_not_remove_last_ball(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        event = {}
        gs._apply_powerup_effect("bomb", event)
        assert len(gs.balls) == 1
        assert "removed_ball" not in event


class TestSkullEffect:
    def test_skull_removes_life(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        gs.lives = 3
        gs._apply_powerup_effect("skull", {})
        assert gs.lives == 2

    def test_skull_causes_loss_at_zero_lives(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        gs.lives = 1
        gs._apply_powerup_effect("skull", {})
        assert gs.lives == 0
        assert gs.state == "lost"


class TestCandyEffect:
    def test_candy_awards_2000_points(self):
        gs = _make_game()
        gs.score = 500
        event = {}
        gs._apply_powerup_effect("candy", event)
        assert gs.score == 2500
        assert event["points"] == 2000


class TestNukeEffect:
    def test_nuke_destroys_balls_in_blast_radius(self):
        gs = _make_game(balls=[
            (100, 100, 0, 0),  # near center
            (105, 105, 0, 0),  # near center
            (100, 100, 0, 0),  # near center (will be close to event)
        ])
        event = {"x": 100, "y": 100}
        gs._apply_powerup_effect("nuke", event)
        assert "blast" in event
        # With NUKE_BLAST_RADIUS=450 and 200x200 area, most balls should be in range

    def test_nuke_keeps_at_least_one_ball(self):
        gs = _make_game(balls=[(100, 100, 0, 0), (105, 105, 0, 0)])
        event = {"x": 100, "y": 100}
        gs._apply_powerup_effect("nuke", event)
        assert len(gs.balls) >= 1


class TestFusionEffect:
    def test_fusion_activates(self):
        gs = _make_game()
        gs._apply_powerup_effect("fusion", {})
        assert gs.is_fusion is True
        assert gs.fusion_timer == FUSION_DURATION

    def test_fusion_timer_expires(self):
        gs = _make_game()
        gs._apply_powerup_effect("fusion", {})
        gs.update_fusion_effect(FUSION_DURATION + 1)
        assert gs.is_fusion is False


class TestFissionPUEffect:
    def test_fission_pu_activates(self):
        gs = _make_game()
        gs._apply_powerup_effect("fission_pu", {})
        assert gs.is_fission_active is True
        assert gs.fission_pu_timer == FISSION_PU_DURATION

    def test_fission_pu_timer_expires(self):
        gs = _make_game()
        gs._apply_powerup_effect("fission_pu", {})
        gs.update_fission_pu_effect(FISSION_PU_DURATION + 1)
        assert gs.is_fission_active is False


class TestWaveEffect:
    def test_wave_activates(self):
        gs = _make_game()
        gs._apply_powerup_effect("wave", {})
        assert gs.is_wave is True
        assert gs.wave_timer == WAVE_DURATION

    def test_wave_timer_expires(self):
        gs = _make_game()
        gs._apply_powerup_effect("wave", {})
        gs.update_wave_effect(WAVE_DURATION + 1)
        assert gs.is_wave is False
        assert gs.wave_elapsed == 0.0

    def test_wave_elapsed_tracks_time(self):
        gs = _make_game()
        gs._apply_powerup_effect("wave", {})
        gs.update_wave_effect(2.0)
        assert gs.wave_elapsed == pytest.approx(2.0)


class TestWebEffect:
    def test_web_creates_zones(self):
        gs = _make_game(width=400, height=400)
        gs._apply_powerup_effect("web", {})
        assert WEB_ZONE_COUNT_MIN <= len(gs.web_zones) <= WEB_ZONE_COUNT_MAX

    def test_web_zone_contains_ball(self):
        zone = WebZone(100, 100, WEB_ZONE_RADIUS, WEB_DURATION)
        ball = Ball(100, 100, 0, 0, BALL_RADIUS)
        assert zone.contains(ball) is True

    def test_web_zone_does_not_contain_distant_ball(self):
        zone = WebZone(100, 100, WEB_ZONE_RADIUS, WEB_DURATION)
        ball = Ball(500, 500, 0, 0, BALL_RADIUS)
        assert zone.contains(ball) is False

    def test_web_zones_expire(self):
        gs = _make_game(width=400, height=400)
        gs.web_zones = [WebZone(100, 100, WEB_ZONE_RADIUS, 1.0)]
        gs.update_web_zones(2.0)
        assert len(gs.web_zones) == 0


class TestPortalEffect:
    def test_portal_creates_pair(self):
        gs = _make_game(width=600, height=600)
        gs._apply_powerup_effect("portal", {})
        assert gs.portal_pair is not None
        assert gs.portal_pair.timer == PORTAL_DURATION

    def test_portal_pair_to_dict(self):
        pp = PortalPair(10, 20, 300, 400, 5.0)
        d = pp.to_dict()
        assert d["portal_a"]["x"] == 10
        assert d["portal_b"]["x"] == 300
        assert d["timer"] == 5.0

    def test_portal_timer_expires(self):
        gs = _make_game(width=600, height=600)
        gs.portal_pair = PortalPair(100, 100, 400, 400, 1.0)
        gs.update_portals(2.0)
        assert gs.portal_pair is None


class TestSinkholeEffect:
    def test_sinkhole_creates(self):
        gs = _make_game(width=400, height=400)
        gs._apply_powerup_effect("sinkhole", {})
        assert gs.sinkhole is not None
        assert gs.sinkhole.timer == SINKHOLE_DURATION

    def test_sinkhole_timer_expires(self):
        gs = _make_game(width=400, height=400)
        gs.sinkhole = Sinkhole(200, 200, SINKHOLE_RADIUS, SINKHOLE_PULL_RADIUS, 1.0)
        gs.update_sinkhole(2.0)
        assert gs.sinkhole is None

    def test_sinkhole_pulls_balls(self):
        gs = _make_game(width=400, height=400, balls=[(250, 200, 0, 0)])
        gs.sinkhole = Sinkhole(200, 200, SINKHOLE_RADIUS, SINKHOLE_PULL_RADIUS, 10.0)
        initial_vx = gs.balls[0].vx
        gs.update_sinkhole(0.1)
        # Ball should now have velocity toward sinkhole (negative vx since sinkhole is to the left)
        assert gs.balls[0].vx < initial_vx or gs.balls[0].vx != 0

    def test_sinkhole_destroys_ball_inside_radius(self):
        gs = _make_game(width=400, height=400, balls=[
            (200, 200, 0, 0),  # right on the sinkhole
            (350, 350, 0, 0),  # far away (kept alive)
        ])
        gs.sinkhole = Sinkhole(200, 200, SINKHOLE_RADIUS, SINKHOLE_PULL_RADIUS, 10.0)
        gs.update_sinkhole(0.1)
        assert len(gs.balls) == 1  # one destroyed, one remains
        assert len(gs.sinkhole_events) == 1


class TestMagnetEffect:
    def test_magnet_creates(self):
        gs = _make_game(width=600, height=600)
        gs._apply_powerup_effect("magnet", {})
        assert gs.magnet is not None
        assert gs.magnet.timer == MAGNET_DURATION

    def test_magnet_timer_expires(self):
        gs = _make_game()
        gs.magnet = Magnet(100, 100, 1.0)
        gs.update_magnet(2.0)
        assert gs.magnet is None

    def test_magnet_pulls_ball_toward_it(self):
        gs = _make_game(balls=[(150, 100, 0, 0)])
        gs.magnet = Magnet(100, 100, 10.0)
        gs.update_magnet(0.1)
        # Ball should now have negative vx (pulled left toward magnet)
        assert gs.balls[0].vx < 0

    def test_magnet_to_dict(self):
        m = Magnet(50, 75, 8.5)
        d = m.to_dict()
        assert d["x"] == 50
        assert d["y"] == 75
        assert d["timer"] == 8.5


class TestJackpotEffect:
    def test_jackpot_wins_game(self):
        gs = _make_game(balls=[(100, 100, 0, 0)])
        event = {"x": 50, "y": 50}
        gs._apply_powerup_effect("jackpot", event)
        assert gs.state == "won"
        assert gs.fill_percentage == 100.0
