"""
Tests for the obstacle system in the Dave Ball arcade game.

Covers: ObstacleShape construction, vertex generation for each shape type,
contains_point ray-casting, obstacle spawning per level, boundary segment
integration, and territory grid interaction.
"""

import math

import pytest

from backend.game_state import GameState, ObstacleShape
from backend.physics import Ball
from backend.config import (
    BALL_RADIUS,
    OBSTACLE_SIZE,
    OBSTACLE_SHAPES,
)

pytestmark = pytest.mark.obstacles


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_game(width=800, height=600, balls=None, level=1):
    gs = GameState(width=width, height=height, num_balls=0)
    gs._clear_obstacles()
    gs.balls.clear()
    if balls:
        for x, y, vx, vy in balls:
            gs.balls.append(Ball(x, y, vx, vy, BALL_RADIUS))
    gs.state = "playing"
    gs.level = level
    return gs


# ---------------------------------------------------------------------------
# ObstacleShape construction
# ---------------------------------------------------------------------------

class TestObstacleShapeConstruction:
    def test_square_has_4_vertices(self):
        obs = ObstacleShape("square", 400, 300, OBSTACLE_SIZE)
        assert len(obs.vertices) == 4

    def test_triangle_has_3_vertices(self):
        obs = ObstacleShape("triangle", 400, 300, OBSTACLE_SIZE)
        assert len(obs.vertices) == 3

    def test_circle_has_24_vertices(self):
        obs = ObstacleShape("circle", 400, 300, OBSTACLE_SIZE)
        assert len(obs.vertices) == 24

    def test_diamond_has_4_vertices(self):
        obs = ObstacleShape("diamond", 400, 300, OBSTACLE_SIZE)
        assert len(obs.vertices) == 4

    def test_star_has_10_vertices(self):
        obs = ObstacleShape("star", 400, 300, OBSTACLE_SIZE)
        assert len(obs.vertices) == 10

    def test_octagon_has_8_vertices(self):
        obs = ObstacleShape("octagon", 400, 300, OBSTACLE_SIZE)
        assert len(obs.vertices) == 8

    def test_boundary_segments_match_vertices(self):
        for shape_type in OBSTACLE_SHAPES:
            obs = ObstacleShape(shape_type, 400, 300, OBSTACLE_SIZE)
            assert len(obs.boundary_segments) == len(obs.vertices)

    def test_boundary_segments_form_closed_polygon(self):
        obs = ObstacleShape("square", 400, 300, OBSTACLE_SIZE)
        n = len(obs.boundary_segments)
        for i in range(n):
            seg = obs.boundary_segments[i]
            next_seg = obs.boundary_segments[(i + 1) % n]
            assert seg["x2"] == pytest.approx(next_seg["x1"], abs=0.01)
            assert seg["y2"] == pytest.approx(next_seg["y1"], abs=0.01)

    def test_unknown_shape_falls_back_to_square(self):
        obs = ObstacleShape("unknown_shape", 400, 300, OBSTACLE_SIZE)
        assert len(obs.vertices) == 4


# ---------------------------------------------------------------------------
# contains_point (ray-casting)
# ---------------------------------------------------------------------------

class TestContainsPoint:
    def test_center_point_inside_square(self):
        obs = ObstacleShape("square", 400, 300, OBSTACLE_SIZE)
        assert obs.contains_point(400, 300) is True

    def test_far_point_outside_square(self):
        obs = ObstacleShape("square", 400, 300, OBSTACLE_SIZE)
        assert obs.contains_point(0, 0) is False

    def test_center_inside_circle(self):
        obs = ObstacleShape("circle", 400, 300, OBSTACLE_SIZE)
        assert obs.contains_point(400, 300) is True

    def test_far_point_outside_circle(self):
        obs = ObstacleShape("circle", 400, 300, OBSTACLE_SIZE)
        assert obs.contains_point(0, 0) is False

    def test_center_inside_triangle(self):
        obs = ObstacleShape("triangle", 400, 300, OBSTACLE_SIZE)
        assert obs.contains_point(400, 300) is True

    def test_center_inside_diamond(self):
        obs = ObstacleShape("diamond", 400, 300, OBSTACLE_SIZE)
        assert obs.contains_point(400, 300) is True

    def test_center_inside_star(self):
        obs = ObstacleShape("star", 400, 300, OBSTACLE_SIZE)
        assert obs.contains_point(400, 300) is True

    def test_center_inside_octagon(self):
        obs = ObstacleShape("octagon", 400, 300, OBSTACLE_SIZE)
        assert obs.contains_point(400, 300) is True


# ---------------------------------------------------------------------------
# Obstacle spawning per level
# ---------------------------------------------------------------------------

class TestObstacleSpawning:
    def test_level_1_has_no_obstacles(self):
        gs = GameState(width=800, height=600, num_balls=0)
        gs.level = 1
        gs._clear_obstacles()
        gs._init_obstacles()
        assert len(gs.obstacles) == 0

    def test_level_2_has_one_obstacle(self):
        gs = GameState(width=800, height=600, num_balls=0)
        gs.level = 2
        gs._clear_obstacles()
        gs._init_obstacles()
        assert len(gs.obstacles) == 1

    def test_level_3_plus_has_multiple_obstacles(self):
        gs = GameState(width=800, height=600, num_balls=0)
        gs.level = 3
        gs._clear_obstacles()
        gs._init_obstacles()
        assert 2 <= len(gs.obstacles) <= 4

    def test_obstacle_boundaries_added(self):
        gs = GameState(width=800, height=600, num_balls=0)
        gs.level = 2
        gs._clear_obstacles()
        boundary_count_before = len(gs.boundaries)
        gs._init_obstacles()
        if gs.obstacles:
            assert len(gs.boundaries) > boundary_count_before

    def test_obstacle_filled_region_created(self):
        gs = GameState(width=800, height=600, num_balls=0)
        gs.level = 2
        gs._clear_obstacles()
        gs._init_obstacles()
        if gs.obstacles:
            obstacle_regions = [r for r in gs.filled_regions if r.get("obstacle")]
            assert len(obstacle_regions) == len(gs.obstacles)


# ---------------------------------------------------------------------------
# Obstacle interaction with game mechanics
# ---------------------------------------------------------------------------

class TestObstacleInteraction:
    def test_line_rejected_inside_obstacle(self):
        gs = _make_game(width=800, height=600, balls=[(700, 500, 0, 0)])
        obs = ObstacleShape("square", 400, 300, OBSTACLE_SIZE)
        gs.obstacles = [obs]
        # Click inside the obstacle
        result = gs.start_line(400, 300, "vertical")
        assert result is False

    def test_line_accepted_outside_obstacle(self):
        gs = _make_game(width=800, height=600, balls=[(700, 500, 0, 0)])
        obs = ObstacleShape("square", 400, 300, OBSTACLE_SIZE)
        gs.obstacles = [obs]
        # Click far from obstacle
        result = gs.start_line(100, 100, "vertical")
        assert result is True

    def test_clear_obstacles_removes_all(self):
        gs = GameState(width=800, height=600, num_balls=0)
        gs.level = 3
        gs._init_obstacles()
        gs._clear_obstacles()
        assert len(gs.obstacles) == 0
        obstacle_regions = [r for r in gs.filled_regions if r.get("obstacle")]
        assert len(obstacle_regions) == 0

    def test_obstacle_to_dict(self):
        obs = ObstacleShape("square", 400, 300, OBSTACLE_SIZE)
        d = obs.to_dict()
        assert d["shape_type"] == "square"
        assert d["center_x"] == 400
        assert d["center_y"] == 300
        assert "vertices" in d

    def test_balls_not_spawned_inside_obstacles(self):
        """When balls are initialized with obstacles present, none should overlap."""
        gs = GameState(width=800, height=600, num_balls=3)
        # Check no ball is inside an obstacle
        for ball in gs.balls:
            for obs in gs.obstacles:
                assert obs.contains_point(ball.x, ball.y) is False
