"""Game state management for the Dave Ball arcade game.

Owns the authoritative server-side game state: play area, balls,
boundaries, growing lines, filled regions, score, and lives.
"""

from __future__ import annotations

import logging
import math
import random
import time
from collections import defaultdict
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

try:
    from .physics import Ball
    from .physics import check_ball_ball_collision, check_line_ball_collision, check_wall_collision
    from .config import (
        ACID_DURATION,
        ACID_POOL_COUNT_MAX,
        ACID_POOL_COUNT_MIN,
        ACID_POOL_RADIUS,
        BALL_RADIUS,
        BALL_SPEED,
        CLOCK_SLOW_DURATION,
        CLOCK_SLOW_FACTOR,
        EFFICIENCY_BONUS_BASE,
        EFFICIENCY_BONUS_PENALTY,
        FISSION_COOLDOWN,
        FISSION_DENSITY_MAX,
        FISSION_DENSITY_RADIUS,
        FREEZE_DURATION,
        FRUIT_MAX_ON_FIELD,
        FRUIT_POINTS,
        FRUIT_SPAWN_CHANCE,
        FRUIT_WEIGHTS,
        GRID_CELL_SIZE,
        GROW_DURATION,
        GROW_FACTOR,
        JACKPOT_SPAWN_CHANCE,
        LEVEL_SHAPES,
        LEVEL_TIME_LIMIT,
        LIFE_BONUS_POINTS,
        LIGHTNING_SPEED_MULTIPLIER,
        LINE_GROWTH_SPEED,
        MAGNET_DURATION,
        MAGNET_PULL_FORCE,
        MAX_BALLS,
        MAX_GROWING_LINES,
        NUKE_BLAST_RADIUS,
        OBSTACLE_MARGIN,
        OBSTACLE_MIN_SPACING,
        OBSTACLE_SHAPES,
        OBSTACLE_SIZE,
        PORTAL_ANGLE_OFFSET,
        PORTAL_COOLDOWN,
        PORTAL_DURATION,
        PORTAL_RADIUS,
        POWERUP_MAX_ON_FIELD,
        POWERUP_SPAWN_CHANCE,
        POWERUP_WEIGHTS,
        SHRINK_DURATION,
        SHRINK_FACTOR,
        SINKHOLE_DURATION,
        SINKHOLE_PULL_FORCE,
        SINKHOLE_PULL_RADIUS,
        SINKHOLE_RADIUS,
        SNAKE_DURATION,
        SNAKE_EAT_RADIUS,
        SNAKE_SEGMENT_COUNT,
        SNAKE_SEGMENT_RADIUS,
        SNAKE_SEGMENT_SPACING,
        SNAKE_SPEED,
        FISSION_PU_DURATION,
        FUSION_DURATION,
        FUSION_MAX_RADIUS,
        TIME_BONUS_BASE,
        TIME_BONUS_DECAY,
        WAVE_AMPLITUDE,
        WAVE_DURATION,
        WAVE_FREQUENCY,
        WEB_DURATION,
        WEB_LINGER_DURATION,
        WEB_SLOW_FACTOR,
        WEB_ZONE_COUNT_MAX,
        WEB_ZONE_COUNT_MIN,
        WEB_ZONE_RADIUS,
        WIN_FILL_PERCENT,
    )
    from .territory import Grid, find_enclosed_regions
except ImportError:
    from physics import Ball  # type: ignore[no-redef]
    from physics import check_ball_ball_collision, check_line_ball_collision, check_wall_collision  # type: ignore[no-redef]
    from config import (  # type: ignore[no-redef]
        ACID_DURATION,
        ACID_POOL_COUNT_MAX,
        ACID_POOL_COUNT_MIN,
        ACID_POOL_RADIUS,
        BALL_RADIUS,
        BALL_SPEED,
        CLOCK_SLOW_DURATION,
        CLOCK_SLOW_FACTOR,
        EFFICIENCY_BONUS_BASE,
        EFFICIENCY_BONUS_PENALTY,
        FISSION_COOLDOWN,
        FISSION_DENSITY_MAX,
        FISSION_DENSITY_RADIUS,
        FREEZE_DURATION,
        FRUIT_MAX_ON_FIELD,
        FRUIT_POINTS,
        FRUIT_SPAWN_CHANCE,
        FRUIT_WEIGHTS,
        GRID_CELL_SIZE,
        GROW_DURATION,
        GROW_FACTOR,
        JACKPOT_SPAWN_CHANCE,
        LEVEL_SHAPES,
        LEVEL_TIME_LIMIT,
        LIFE_BONUS_POINTS,
        LIGHTNING_SPEED_MULTIPLIER,
        LINE_GROWTH_SPEED,
        MAGNET_DURATION,
        MAGNET_PULL_FORCE,
        MAX_BALLS,
        MAX_GROWING_LINES,
        NUKE_BLAST_RADIUS,
        OBSTACLE_MARGIN,
        OBSTACLE_MIN_SPACING,
        OBSTACLE_SHAPES,
        OBSTACLE_SIZE,
        PORTAL_ANGLE_OFFSET,
        PORTAL_COOLDOWN,
        PORTAL_DURATION,
        PORTAL_RADIUS,
        POWERUP_MAX_ON_FIELD,
        POWERUP_SPAWN_CHANCE,
        POWERUP_WEIGHTS,
        SHRINK_DURATION,
        SHRINK_FACTOR,
        SINKHOLE_DURATION,
        SINKHOLE_PULL_FORCE,
        SINKHOLE_PULL_RADIUS,
        SINKHOLE_RADIUS,
        SNAKE_DURATION,
        SNAKE_EAT_RADIUS,
        SNAKE_SEGMENT_COUNT,
        SNAKE_SEGMENT_RADIUS,
        SNAKE_SEGMENT_SPACING,
        SNAKE_SPEED,
        FISSION_PU_DURATION,
        FUSION_DURATION,
        FUSION_MAX_RADIUS,
        TIME_BONUS_BASE,
        TIME_BONUS_DECAY,
        WAVE_AMPLITUDE,
        WAVE_DURATION,
        WAVE_FREQUENCY,
        WEB_DURATION,
        WEB_LINGER_DURATION,
        WEB_SLOW_FACTOR,
        WEB_ZONE_COUNT_MAX,
        WEB_ZONE_COUNT_MIN,
        WEB_ZONE_RADIUS,
        WIN_FILL_PERCENT,
    )
    from territory import Grid, find_enclosed_regions  # type: ignore[no-redef]


class PowerUp:
    """A collectible power-up item on the play field."""

    FRUIT_KINDS = frozenset(FRUIT_POINTS.keys())

    def __init__(self, x: float, y: float, kind: str, item_id: int) -> None:
        self.x = x
        self.y = y
        self.kind = kind
        self.item_id = item_id
        self.active = True

    @property
    def is_fruit(self) -> bool:
        return self.kind in self.FRUIT_KINDS

    def to_dict(self) -> Dict[str, Any]:
        return {"x": self.x, "y": self.y, "kind": self.kind, "id": self.item_id, "active": self.active, "is_fruit": self.is_fruit}


class WebZone:
    """A sticky web zone that slows balls passing through it."""

    def __init__(self, x: float, y: float, radius: float, duration: float) -> None:
        self.x = x
        self.y = y
        self.radius = radius
        self.timer = duration

    def to_dict(self) -> Dict[str, Any]:
        return {"x": self.x, "y": self.y, "radius": self.radius, "timer": round(self.timer, 1)}

    def contains(self, ball: Any) -> bool:
        """Return True if ball center is within this zone's radius."""
        dx = ball.x - self.x
        dy = ball.y - self.y
        return (dx * dx + dy * dy) <= self.radius * self.radius


class Sinkhole:
    """A gravitational sinkhole that pulls in and destroys balls."""

    def __init__(self, x: float, y: float, radius: float, pull_radius: float, duration: float) -> None:
        self.x = x
        self.y = y
        self.radius = radius
        self.pull_radius = pull_radius
        self.timer = duration

    def to_dict(self) -> Dict[str, Any]:
        return {
            "x": self.x,
            "y": self.y,
            "radius": self.radius,
            "pull_radius": self.pull_radius,
            "timer": round(self.timer, 1),
        }

class AcidPool:
    """An acid pool that dissolves balls entering it."""

    def __init__(self, x: float, y: float, radius: float, duration: float) -> None:
        self.x = x
        self.y = y
        self.radius = radius
        self.timer = duration
        self.active = True

    def to_dict(self) -> Dict[str, Any]:
        return {"x": self.x, "y": self.y, "radius": self.radius, "timer": round(self.timer, 1)}


class Magnet:
    """A magnet that attracts all balls toward it without destroying them."""

    def __init__(self, x: float, y: float, duration: float) -> None:
        self.x = x
        self.y = y
        self.timer = duration

    def to_dict(self) -> Dict[str, Any]:
        return {
            "x": self.x,
            "y": self.y,
            "timer": round(self.timer, 1),
        }


class Snake:
    """A slithering snake that hunts and eats balls."""

    def __init__(self, x: float, y: float) -> None:
        self.segments: List[Dict[str, float]] = [{'x': x, 'y': y} for _ in range(SNAKE_SEGMENT_COUNT)]
        self.position_history: List[Dict[str, float]] = []
        self.timer: float = SNAKE_DURATION
        self.active: bool = True
        self.eat_events: List[Dict[str, float]] = []
        self.elapsed: float = 0.0  # total time alive, for wobble calculation

    def to_dict(self) -> Dict[str, Any]:
        return {
            'segments': self.segments,
            'timer': round(self.timer, 1),
            'active': self.active,
            'eat_events': list(self.eat_events),
        }


class PortalPair:
    """A bidirectional pair of portals that teleport balls between them."""

    def __init__(self, ax: float, ay: float, bx: float, by: float, duration: float) -> None:
        self.a = {"x": ax, "y": ay}
        self.b = {"x": bx, "y": by}
        self.timer = duration

    def to_dict(self) -> Dict[str, Any]:
        return {
            "portal_a": {"x": self.a["x"], "y": self.a["y"]},
            "portal_b": {"x": self.b["x"], "y": self.b["y"]},
            "timer": round(self.timer, 1),
        }


class GrowingLine:
    """A line actively growing from a click point in two directions.

    Each line has two "arms" extending from the origin toward opposite
    borders (or the nearest existing boundary in that direction).
    """

    __slots__ = (
        "start_x", "start_y", "direction", "growth_speed",
        "arm1_target", "arm2_target",
        "arm1_max", "arm2_max",
        "arm1_progress", "arm2_progress",
        "arm1_complete", "arm2_complete",
        "active", "is_fire",
    )

    def __init__(
        self,
        start_x: float,
        start_y: float,
        direction: str,
        arm1_target: float,
        arm2_target: float,
        growth_speed: float = LINE_GROWTH_SPEED,
    ) -> None:
        self.start_x = start_x
        self.start_y = start_y
        self.direction = direction  # 'vertical' or 'horizontal'
        self.growth_speed = growth_speed
        self.arm1_target = arm1_target
        self.arm2_target = arm2_target
        self.arm1_progress: float = 0.0
        self.arm2_progress: float = 0.0
        self.arm1_complete: bool = False
        self.arm2_complete: bool = False
        self.active: bool = True
        self.is_fire: bool = False

        # Max distance each arm can travel
        if direction == "vertical":
            self.arm1_max = start_y - arm1_target  # upward
            self.arm2_max = arm2_target - start_y   # downward
        else:
            self.arm1_max = start_x - arm1_target  # leftward
            self.arm2_max = arm2_target - start_x   # rightward

    def grow(self, dt: float) -> None:
        """Extend both arms by growth_speed × dt."""
        delta = self.growth_speed * dt
        if not self.arm1_complete:
            self.arm1_progress = min(self.arm1_progress + delta, self.arm1_max)
            if self.arm1_progress >= self.arm1_max:
                self.arm1_complete = True
        if not self.arm2_complete:
            self.arm2_progress = min(self.arm2_progress + delta, self.arm2_max)
            if self.arm2_progress >= self.arm2_max:
                self.arm2_complete = True

    @property
    def is_complete(self) -> bool:
        return self.arm1_complete and self.arm2_complete

    def get_segments(self) -> List[Dict[str, float]]:
        """Return the current line segments for each arm (up to two)."""
        segments: List[Dict[str, float]] = []
        if self.direction == "vertical":
            if self.arm1_progress > 0:
                segments.append({
                    "x1": self.start_x,
                    "y1": self.start_y - self.arm1_progress,
                    "x2": self.start_x,
                    "y2": self.start_y,
                })
            if self.arm2_progress > 0:
                segments.append({
                    "x1": self.start_x,
                    "y1": self.start_y,
                    "x2": self.start_x,
                    "y2": self.start_y + self.arm2_progress,
                })
        else:
            if self.arm1_progress > 0:
                segments.append({
                    "x1": self.start_x - self.arm1_progress,
                    "y1": self.start_y,
                    "x2": self.start_x,
                    "y2": self.start_y,
                })
            if self.arm2_progress > 0:
                segments.append({
                    "x1": self.start_x,
                    "y1": self.start_y,
                    "x2": self.start_x + self.arm2_progress,
                    "y2": self.start_y,
                })
        return segments

    def get_full_segment(self) -> Dict[str, float]:
        """Return the single end-to-end segment covering both arms."""
        if self.direction == "vertical":
            return {
                "x1": self.start_x,
                "y1": self.start_y - self.arm1_progress,
                "x2": self.start_x,
                "y2": self.start_y + self.arm2_progress,
            }
        return {
            "x1": self.start_x - self.arm1_progress,
            "y1": self.start_y,
            "x2": self.start_x + self.arm2_progress,
            "y2": self.start_y,
        }

    def to_dict(self) -> Dict[str, Any]:
        seg = self.get_full_segment()
        return {
            "start_x": self.start_x,
            "start_y": self.start_y,
            "direction": self.direction,
            "x1": seg["x1"],
            "y1": seg["y1"],
            "x2": seg["x2"],
            "y2": seg["y2"],
            "arm1_complete": self.arm1_complete,
            "arm2_complete": self.arm2_complete,
            "active": self.active,
            "is_fire": self.is_fire,
        }


class ObstacleShape:
    """A pre-filled obstacle polygon that balls bounce off."""

    def __init__(self, shape_type: str, center_x: float, center_y: float, size: float) -> None:
        self.shape_type = shape_type
        self.center_x = center_x
        self.center_y = center_y
        self.size = size
        self.vertices: List[Dict[str, float]] = self._generate_vertices()
        self.boundary_segments: List[Dict[str, float]] = self._generate_boundaries()

    def _generate_vertices(self) -> List[Dict[str, float]]:
        cx, cy = self.center_x, self.center_y
        r = self.size / 2.0

        if self.shape_type == 'circle':
            n = 24
            return [
                {"x": cx + r * math.cos(2 * math.pi * i / n),
                 "y": cy + r * math.sin(2 * math.pi * i / n)}
                for i in range(n)
            ]

        elif self.shape_type == 'square':
            half = self.size / 2.0
            return [
                {"x": cx - half, "y": cy - half},
                {"x": cx + half, "y": cy - half},
                {"x": cx + half, "y": cy + half},
                {"x": cx - half, "y": cy + half},
            ]

        elif self.shape_type == 'triangle':
            return [
                {"x": cx + r * math.cos(2 * math.pi * i / 3 - math.pi / 2),
                 "y": cy + r * math.sin(2 * math.pi * i / 3 - math.pi / 2)}
                for i in range(3)
            ]

        elif self.shape_type == 'diamond':
            return [
                {"x": cx, "y": cy - r},
                {"x": cx + r, "y": cy},
                {"x": cx, "y": cy + r},
                {"x": cx - r, "y": cy},
            ]

        elif self.shape_type == 'star':
            outer_r = self.size / 2.0
            inner_r = self.size / 4.5
            verts = []
            for i in range(10):
                angle = math.pi / 2 + i * math.pi / 5
                rad = outer_r if i % 2 == 0 else inner_r
                verts.append({"x": cx + rad * math.cos(angle),
                              "y": cy - rad * math.sin(angle)})
            return verts

        elif self.shape_type == 'octagon':
            return [
                {"x": cx + r * math.cos(2 * math.pi * i / 8),
                 "y": cy + r * math.sin(2 * math.pi * i / 8)}
                for i in range(8)
            ]

        # Fallback to square
        half = self.size / 2.0
        return [
            {"x": cx - half, "y": cy - half},
            {"x": cx + half, "y": cy - half},
            {"x": cx + half, "y": cy + half},
            {"x": cx - half, "y": cy + half},
        ]

    def _generate_boundaries(self) -> List[Dict[str, float]]:
        segs = []
        n = len(self.vertices)
        for i in range(n):
            v1 = self.vertices[i]
            v2 = self.vertices[(i + 1) % n]
            segs.append({"x1": v1["x"], "y1": v1["y"],
                         "x2": v2["x"], "y2": v2["y"]})
        return segs

    def contains_point(self, x: float, y: float) -> bool:
        """Ray-casting point-in-polygon test."""
        verts = self.vertices
        n = len(verts)
        inside = False
        j = n - 1
        for i in range(n):
            xi, yi = verts[i]["x"], verts[i]["y"]
            xj, yj = verts[j]["x"], verts[j]["y"]
            if ((yi > y) != (yj > y)) and \
               (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
                inside = not inside
            j = i
        return inside

    def to_dict(self) -> Dict[str, Any]:
        return {
            "shape_type": self.shape_type,
            "center_x": self.center_x,
            "center_y": self.center_y,
            "vertices": self.vertices,
        }


class GameState:
    """Complete state of a running Dave Ball game."""

    def __init__(
        self,
        width: int = 800,
        height: int = 600,
        num_balls: int = 2,
        speed_multiplier: float = 1.0,
    ) -> None:
        self._width = width
        self._height = height
        self._num_balls = num_balls
        self.speed_multiplier: float = speed_multiplier

        self.tick_count: int = 0

        self.play_area: Dict[str, int] = {
            "x": 0,
            "y": 0,
            "width": width,
            "height": height,
        }
        self.balls: List[Ball] = []
        self.boundaries: List[Dict[str, float]] = []
        self.growing_lines: List[GrowingLine] = []
        self.filled_regions: List[Dict[str, Any]] = []
        self.lives: int = num_balls + 1
        self.score: int = 0
        self.level: int = 1
        self.fill_percentage: float = 0.0
        self.state: str = "waiting"

        # Event flags — consumed by game loop each tick
        self.line_failed: bool = False
        self.line_completed: bool = False
        self.territory_recalc_needed: bool = False
        self.ball_collision_events: List[Dict[str, float]] = []

        # Scoring / timer state
        self.level_timer: float = LEVEL_TIME_LIMIT
        self.lines_drawn: int = 0
        self.level_score_breakdown: Optional[Dict[str, int]] = None

        # Power-up state
        self.powerups: List[PowerUp] = []
        self.powerup_events: List[Dict[str, Any]] = []
        self.slow_timer: float = 0.0
        self.is_slowed: bool = False
        self.shield_active: bool = False
        self.lightning_charges: int = 0
        self.fire_active: bool = False
        self.fire_destroy_events: List[Dict[str, Any]] = []
        self.freeze_timer: float = 0.0
        self.is_frozen: bool = False
        self.anchor_active: bool = False
        self.shrink_timer: float = 0.0
        self.is_shrunk: bool = False
        self._original_radii: Dict[int, float] = {}
        self.grow_timer: float = 0.0
        self.is_grown: bool = False
        self._grow_original_radii: Dict[int, float] = {}
        self.fusion_timer: float = 0.0
        self.is_fusion: bool = False
        self.ball_merge_events: List[Dict[str, float]] = []
        self.is_fission_active: bool = False
        self.fission_pu_timer: float = 0.0
        self.is_wave: bool = False
        self.wave_timer: float = 0.0
        self.wave_elapsed: float = 0.0
        self._powerup_id_counter: int = 0

        # Web zone state
        self.web_zones: List[WebZone] = []
        self.ball_web_timers: Dict[int, float] = {}  # ball id -> linger timer
        self._ball_original_speeds: Dict[int, float] = {}  # ball id -> original speed
        self._balls_in_web: set = set()  # ball ids currently inside a web zone

        # Portal state
        self.portal_pair: Optional[PortalPair] = None
        self.ball_portal_cooldowns: Dict[int, float] = {}  # ball id -> remaining cooldown
        self.portal_events: List[Dict[str, Any]] = []  # teleport events this tick

        # Sinkhole state
        self.sinkhole: Optional[Sinkhole] = None
        self.sinkhole_events: List[Dict[str, float]] = []

        # Magnet state
        self.magnet: Optional[Magnet] = None

        # Snake state
        self.snake: Optional[Snake] = None
        self.snake_eat_events: List[Dict[str, float]] = []

        # Acid pool state
        self.acid_pools: List[AcidPool] = []
        self.acid_dissolve_events: List[Dict[str, float]] = []

        # Fruit state (separate from power-ups)
        self.fruits: List[PowerUp] = []

        # Obstacle state
        self.obstacles: List[ObstacleShape] = []

        self._init_play_area_shape()
        self._init_obstacles()
        self._init_balls(num_balls, speed=BALL_SPEED * self.speed_multiplier)

    # ------------------------------------------------------------------
    # Initialisation helpers
    # ------------------------------------------------------------------

    def _init_play_area_shape(self) -> None:
        """Create boundary segments defining the play area shape for the current level.

        Each level shape is a closed polygon. The boundary segments trace
        the outline, and _shape_vertices stores the vertex list for
        point-in-polygon tests and frontend rendering.
        """
        self.level_shape = LEVEL_SHAPES[(self.level - 1) % len(LEVEL_SHAPES)]
        w, h = self._width, self._height

        if self.level_shape == 'rectangle':
            self._shape_vertices = [(0, 0), (w, 0), (w, h), (0, h)]

        elif self.level_shape == 'cross':
            # Horizontal bar: y=200..400, full width
            # Vertical bar: x=267..533, full height
            self._shape_vertices = [
                (267, 0), (533, 0), (533, 200), (w, 200),
                (w, 400), (533, 400), (533, h), (267, h),
                (267, 400), (0, 400), (0, 200), (267, 200),
            ]

        elif self.level_shape == 'l-shape':
            # Left bar: x=0..400, full height; bottom bar: full width, y=300..600
            self._shape_vertices = [
                (0, 0), (400, 0), (400, 300), (w, 300),
                (w, h), (0, h),
            ]

        elif self.level_shape == 'h-shape':
            # Left pillar x=0..200, right pillar x=600..800, bridge y=250..350
            self._shape_vertices = [
                (0, 0), (200, 0), (200, 250), (600, 250),
                (600, 0), (w, 0), (w, h), (600, h),
                (600, 350), (200, 350), (200, h), (0, h),
            ]

        elif self.level_shape == 'circle':
            cx, cy, r = 400, 300, 250
            num_seg = 32
            self._shape_vertices = [
                (cx + r * math.cos(2 * math.pi * i / num_seg),
                 cy + r * math.sin(2 * math.pi * i / num_seg))
                for i in range(num_seg)
            ]

        elif self.level_shape == 'octagon':
            cx, cy, r = 400, 300, 290
            self._shape_vertices = [
                (cx + r * math.cos(2 * math.pi * i / 8 - math.pi / 8),
                 cy + r * math.sin(2 * math.pi * i / 8 - math.pi / 8))
                for i in range(8)
            ]

        else:
            # Fallback to rectangle
            self._shape_vertices = [(0, 0), (w, 0), (w, h), (0, h)]

        # Build boundary segments from the closed polygon
        self.boundaries = []
        n = len(self._shape_vertices)
        for i in range(n):
            x1, y1 = self._shape_vertices[i]
            x2, y2 = self._shape_vertices[(i + 1) % n]
            self.boundaries.append({"x1": x1, "y1": y1, "x2": x2, "y2": y2})

    # ------------------------------------------------------------------
    # Shape geometry helpers
    # ------------------------------------------------------------------

    def _is_point_inside_shape(self, x: float, y: float) -> bool:
        """Return True if (x, y) is inside the play area shape (ray casting)."""
        vertices = self._shape_vertices
        n = len(vertices)
        inside = False
        j = n - 1
        for i in range(n):
            xi, yi = vertices[i]
            xj, yj = vertices[j]
            if ((yi > y) != (yj > y)) and \
               (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
                inside = not inside
            j = i
        return inside

    @staticmethod
    def _nearest_point_on_segment(px, py, x1, y1, x2, y2):
        """Return the nearest point on segment (x1,y1)-(x2,y2) to (px,py)."""
        dx, dy = x2 - x1, y2 - y1
        if dx == 0 and dy == 0:
            return x1, y1
        t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
        return x1 + t * dx, y1 + t * dy

    def _init_obstacles(self) -> None:
        """Spawn random obstacle shapes inside the play area.

        Count scales with level. Obstacle boundaries are added to
        self.boundaries so balls bounce off them, and a filled region
        is recorded for each obstacle.
        """
        self.obstacles = []

        if self.level <= 1:
            count = 0
        elif self.level <= 2:
            count = 1
        else:
            count = random.randint(2, 4)

        margin = OBSTACLE_MARGIN
        min_spacing = OBSTACLE_MIN_SPACING

        for _ in range(count):
            for _attempt in range(100):
                shape_type = random.choice(OBSTACLE_SHAPES)
                cx = random.uniform(margin, self._width - margin)
                cy = random.uniform(margin, self._height - margin)

                if not self._is_point_inside_shape(cx, cy):
                    continue

                # Check spacing from existing obstacles
                too_close = False
                for obs in self.obstacles:
                    dx = cx - obs.center_x
                    dy = cy - obs.center_y
                    if math.sqrt(dx * dx + dy * dy) < min_spacing:
                        too_close = True
                        break
                if too_close:
                    continue

                obstacle = ObstacleShape(shape_type, cx, cy, OBSTACLE_SIZE)

                # Verify all vertices are inside the play area
                all_inside = all(
                    self._is_point_inside_shape(v["x"], v["y"])
                    for v in obstacle.vertices
                )
                if not all_inside:
                    continue

                self.obstacles.append(obstacle)
                # Add boundary segments so balls bounce off obstacle edges
                self.boundaries.extend(obstacle.boundary_segments)
                # Add a filled region entry for rendering
                xs = [v["x"] for v in obstacle.vertices]
                ys = [v["y"] for v in obstacle.vertices]
                self.filled_regions.append({
                    "x": min(xs), "y": min(ys),
                    "width": max(xs) - min(xs),
                    "height": max(ys) - min(ys),
                    "cell_count": 0,
                    "obstacle": True,
                    "points": obstacle.vertices,
                })
                break

    def _clear_obstacles(self) -> None:
        """Remove all obstacles and their boundary segments / filled regions."""
        for obs in self.obstacles:
            for seg in obs.boundary_segments:
                if seg in self.boundaries:
                    self.boundaries.remove(seg)
        self.filled_regions = [
            r for r in self.filled_regions if not r.get("obstacle")
        ]
        self.obstacles = []

    def _init_balls(self, num_balls: int, speed: float = BALL_SPEED) -> None:
        """Spawn *num_balls* at random positions inside the play area shape.

        Ensures minimum distance between balls and from shape edges.
        """
        self.balls.clear()
        margin = BALL_RADIUS * 3
        min_dist = BALL_RADIUS * 4  # minimum distance between ball centers

        for _ in range(num_balls):
            for _attempt in range(200):
                x = random.uniform(margin, self._width - margin)
                y = random.uniform(margin, self._height - margin)
                # Must be inside the play area shape
                if not self._is_point_inside_shape(x, y):
                    continue
                # Must not be inside any obstacle
                in_obstacle = any(obs.contains_point(x, y) for obs in self.obstacles)
                if in_obstacle:
                    continue
                # Check distance from existing balls
                too_close = False
                for existing in self.balls:
                    dx = x - existing.x
                    dy = y - existing.y
                    if math.sqrt(dx * dx + dy * dy) < min_dist:
                        too_close = True
                        break
                if not too_close:
                    break
            angle = random.uniform(0, 2 * math.pi)
            vx = speed * math.cos(angle)
            vy = speed * math.sin(angle)
            self.balls.append(Ball(x, y, vx, vy, BALL_RADIUS))

    # ------------------------------------------------------------------
    # Boundary-finding helpers (for line target endpoints)
    # ------------------------------------------------------------------

    def _find_nearest_boundary_vertical(
        self, x: float, y: float
    ) -> tuple[float, float]:
        """Return (target_up, target_down) for a vertical line at *x*.

        Scans all boundary segments (including diagonal ones) for the
        nearest crossing above and below *y*.
        """
        target_up = 0.0     # play-area top
        target_down = float(self._height)  # play-area bottom

        for b in self.boundaries:
            x1, y1, x2, y2 = b["x1"], b["y1"], b["x2"], b["y2"]
            # Skip vertical segments (parallel to the line direction)
            if x1 == x2:
                continue
            # Check if x is within the x-range of this segment
            lo_x = min(x1, x2)
            hi_x = max(x1, x2)
            if x < lo_x or x > hi_x:
                continue
            # Compute y at intersection with vertical line x
            t = (x - x1) / (x2 - x1)
            crossing_y = y1 + t * (y2 - y1)
            if crossing_y < y and crossing_y > target_up:
                target_up = crossing_y
            if crossing_y > y and crossing_y < target_down:
                target_down = crossing_y

        return target_up, target_down

    def _find_nearest_boundary_horizontal(
        self, x: float, y: float
    ) -> tuple[float, float]:
        """Return (target_left, target_right) for a horizontal line at *y*.

        Handles diagonal segments in addition to axis-aligned ones.
        """
        target_left = 0.0
        target_right = float(self._width)

        for b in self.boundaries:
            x1, y1, x2, y2 = b["x1"], b["y1"], b["x2"], b["y2"]
            # Skip horizontal segments (parallel to the line direction)
            if y1 == y2:
                continue
            # Check if y is within the y-range of this segment
            lo_y = min(y1, y2)
            hi_y = max(y1, y2)
            if y < lo_y or y > hi_y:
                continue
            # Compute x at intersection with horizontal line y
            t = (y - y1) / (y2 - y1)
            crossing_x = x1 + t * (x2 - x1)
            if crossing_x < x and crossing_x > target_left:
                target_left = crossing_x
            if crossing_x > x and crossing_x < target_right:
                target_right = crossing_x

        return target_left, target_right

    # ------------------------------------------------------------------
    # Serialisation
    # ------------------------------------------------------------------

    def to_dict(self) -> Dict[str, Any]:
        """JSON-serializable snapshot of the full game state."""
        return {
            "play_area": self.play_area,
            "balls": [b.to_dict() for b in self.balls],
            "boundaries": self.boundaries,
            "growing_lines": [gl.to_dict() for gl in self.growing_lines],
            "filled_regions": self.filled_regions,
            "lives": self.lives,
            "score": self.score,
            "level": self.level,
            "level_shape": self.level_shape,
            "shape_type": self.level_shape,
            "shape_vertices": [{"x": v[0], "y": v[1]} for v in self._shape_vertices],
            "fill_percentage": self.fill_percentage,
            "state": self.state,
            "speed_multiplier": self.speed_multiplier,
            "ball_collisions": list(self.ball_collision_events),
            "level_timer": round(self.level_timer, 1),
            "lines_drawn": self.lines_drawn,
            "level_score_breakdown": self.level_score_breakdown,
            "powerups": [p.to_dict() for p in self.powerups] + [f.to_dict() for f in self.fruits],
            "powerup_events": list(self.powerup_events),
            "is_slowed": self.is_slowed,
            "slow_timer": round(self.slow_timer, 1),
            "shield_active": self.shield_active,
            "lightning_active": self.lightning_charges > 0,
            "lightning_charges": self.lightning_charges,
            "fire_active": self.fire_active,
            "fire_destroy_events": list(self.fire_destroy_events),
            "is_frozen": self.is_frozen,
            "anchor_active": self.anchor_active,
            "freeze_timer": round(self.freeze_timer, 1),
            "is_shrunk": self.is_shrunk,
            "shrink_timer": round(self.shrink_timer, 1),
            "is_grown": self.is_grown,
            "grow_timer": round(self.grow_timer, 1),
            "is_fusion": self.is_fusion,
            "fusion_timer": round(self.fusion_timer, 1),
            "ball_merges": list(self.ball_merge_events),
            "is_fission_active": self.is_fission_active,
            "fission_pu_timer": round(self.fission_pu_timer, 1),
            "is_wave": self.is_wave,
            "wave_timer": round(self.wave_timer, 1),
            "web_zones": [wz.to_dict() for wz in self.web_zones],
            "portal_pair": self.portal_pair.to_dict() if self.portal_pair else None,
            "portal_events": list(self.portal_events),
            "sinkhole": self.sinkhole.to_dict() if self.sinkhole else None,
            "sinkhole_events": list(self.sinkhole_events),
            "magnet": self.magnet.to_dict() if self.magnet else None,
            "snake": self.snake.to_dict() if self.snake else None,
            "snake_eat_events": list(self.snake_eat_events),
            "acid_pools": [ap.to_dict() for ap in self.acid_pools],
            "acid_dissolve_events": list(self.acid_dissolve_events),
            "obstacles": [obs.to_dict() for obs in self.obstacles],
            "server_time": time.monotonic(),
            "tick_count": self.tick_count,
        }

    # ------------------------------------------------------------------
    # State mutation
    # ------------------------------------------------------------------

    def _cleanup_ball_refs(self, ball: "Ball") -> None:
        """Remove tracking-dict entries for a ball that is being destroyed."""
        bid = id(ball)
        self._ball_original_speeds.pop(bid, None)
        self.ball_web_timers.pop(bid, None)
        self.ball_portal_cooldowns.pop(bid, None)
        self._original_radii.pop(bid, None)
        self._grow_original_radii.pop(bid, None)
        self._balls_in_web.discard(bid)

    def _reset_common(self) -> None:
        """Shared reset logic used by both reset() and next_level()."""
        self.growing_lines.clear()
        self.filled_regions.clear()
        self.boundaries.clear()
        self.fill_percentage = 0.0
        self.line_failed = False
        self.line_completed = False
        self.territory_recalc_needed = False
        self.ball_collision_events = []
        self.level_timer = LEVEL_TIME_LIMIT
        self.lines_drawn = 0
        self.level_score_breakdown = None
        self.powerups.clear()
        self.powerup_events.clear()
        self.slow_timer = 0.0
        self.is_slowed = False
        self.shield_active = False
        self.lightning_charges = 0
        self.fire_active = False
        self.fire_destroy_events = []
        self.freeze_timer = 0.0
        self.is_frozen = False
        self.anchor_active = False
        self._restore_radii()
        self.shrink_timer = 0.0
        self.is_shrunk = False
        self._original_radii.clear()
        self._restore_grow_radii()
        self.grow_timer = 0.0
        self.is_grown = False
        self._grow_original_radii.clear()
        self.fusion_timer = 0.0
        self.is_fusion = False
        self.ball_merge_events = []
        self.is_fission_active = False
        self.fission_pu_timer = 0.0
        self.is_wave = False
        self.wave_timer = 0.0
        self.wave_elapsed = 0.0
        self.fruits.clear()
        self.web_zones.clear()
        self.ball_web_timers.clear()
        self._ball_original_speeds.clear()
        self._balls_in_web.clear()
        self.portal_pair = None
        self.ball_portal_cooldowns.clear()
        self.portal_events.clear()
        self.sinkhole = None
        self.sinkhole_events = []
        self.magnet = None
        self.snake = None
        self.snake_eat_events = []
        self.acid_pools = []
        self.acid_dissolve_events = []
        self.obstacles = []

    def reset(self) -> None:
        """Reset to initial state."""
        self._reset_common()
        self.lives = self._num_balls + 1
        self.score = 0
        self.level = 1
        self.state = "waiting"
        self._powerup_id_counter = 0
        self._init_play_area_shape()
        self._init_obstacles()
        self._init_balls(self._num_balls)

    def next_level(self) -> None:
        """Advance to the next level.

        Increments level, adds a ball, increases speed by 10%,
        resets the play area, and preserves cumulative score.
        """
        self.level += 1
        num_balls = self.level + 1  # level 1 = 2, level 2 = 3, etc.
        ball_speed = BALL_SPEED * self.speed_multiplier * (1.1 ** (self.level - 1))

        self._reset_common()
        self.lives = num_balls + 1
        self.state = "playing"

        self._init_play_area_shape()
        self._init_obstacles()
        self._init_balls(num_balls, speed=ball_speed)

        # Spawn one power-up at level start
        self.spawn_powerup()

        # Roll for rare jackpot spawn
        self._maybe_spawn_jackpot()

    def add_boundary(self, x1: float, y1: float, x2: float, y2: float) -> None:
        """Register a completed boundary line segment."""
        self.boundaries.append({"x1": x1, "y1": y1, "x2": x2, "y2": y2})

    def start_line(self, x: float, y: float, direction: str) -> bool:
        """Begin growing a line from a click position.

        Returns True if the line was accepted, False otherwise.
        Validates: within play area, only one line at a time,
        direction is valid, and click is not on an existing boundary.
        """
        if direction not in ("vertical", "horizontal"):
            return False

        # Must be within play area (strictly inside the shape)
        if not self._is_point_inside_shape(x, y):
            return False

        # Only one growing line at a time
        if len(self.growing_lines) >= MAX_GROWING_LINES:
            return False

        # Reject if click is inside a filled (claimed) region
        for region in self.filled_regions:
            if (region["x"] <= x <= region["x"] + region["width"] and
                    region["y"] <= y <= region["y"] + region["height"]):
                return False

        # Reject if click is inside an obstacle
        for obs in self.obstacles:
            if obs.contains_point(x, y):
                return False

        # Reject if click is on an existing boundary
        for b in self.boundaries:
            x1, y1, x2, y2 = b["x1"], b["y1"], b["x2"], b["y2"]
            if x1 == x2 and x == x1:  # vertical boundary
                if min(y1, y2) <= y <= max(y1, y2):
                    return False
            if y1 == y2 and y == y1:  # horizontal boundary
                if min(x1, x2) <= x <= max(x1, x2):
                    return False

        # Find target endpoints for each arm
        if direction == "vertical":
            arm1_target, arm2_target = self._find_nearest_boundary_vertical(x, y)
        else:
            arm1_target, arm2_target = self._find_nearest_boundary_horizontal(x, y)

        line = GrowingLine(
            start_x=x,
            start_y=y,
            direction=direction,
            arm1_target=arm1_target,
            arm2_target=arm2_target,
            growth_speed=LINE_GROWTH_SPEED * LIGHTNING_SPEED_MULTIPLIER if self.lightning_charges else LINE_GROWTH_SPEED,
        )
        if self.fire_active:
            line.is_fire = True
            self.fire_active = False
        self.growing_lines.append(line)
        self.lines_drawn += 1
        return True

    def grow_lines(self, dt: float) -> None:
        """Extend all active growing lines by one tick's worth of growth."""
        for line in list(self.growing_lines):
            if line.active:
                line.grow(dt)
                if line.is_complete:
                    # Before completing, check if any ball touches the
                    # full completed segment.  If so, fail the line instead of
                    # letting the ball end up on the wrong side of a new boundary.
                    # Shield skips this check — line completes no matter what.
                    # Fire lines destroy touching balls instead of failing.
                    full_seg = line.get_full_segment()
                    if self.shield_active:
                        self.complete_line(line)
                    elif line.is_fire:
                        touching = [b for b in self.balls
                                    if check_line_ball_collision(full_seg, b)]
                        for ball in touching:
                            if len(self.balls) <= 1:
                                break
                            self.fire_destroy_events.append(
                                {"x": ball.x, "y": ball.y, "ball_id": id(ball)})
                            self._cleanup_ball_refs(ball)
                            self.balls.remove(ball)
                        self.complete_line(line)
                    else:
                        ball_touching = any(
                            check_line_ball_collision(full_seg, ball)
                            for ball in self.balls
                        )
                        if ball_touching:
                            self.fail_line(line)
                        else:
                            self.complete_line(line)

    def complete_line(self, line: GrowingLine) -> None:
        """Convert a finished growing line into a permanent boundary."""
        seg = line.get_full_segment()
        self.add_boundary(seg["x1"], seg["y1"], seg["x2"], seg["y2"])
        # Fix 3: Immediately push any ball overlapping the new boundary
        # to the correct side before territory recalculation.
        new_boundary = {"x1": seg["x1"], "y1": seg["y1"],
                        "x2": seg["x2"], "y2": seg["y2"]}
        for ball in self.balls:
            check_wall_collision(ball, new_boundary)
        line.active = False
        if line in self.growing_lines:
            self.growing_lines.remove(line)
        self.line_completed = True
        self.territory_recalc_needed = True

        # Consume shield and lightning after line completion
        self.shield_active = False
        self.lightning_charges = max(0, self.lightning_charges - 1)

        # 30% chance to spawn a power-up on successful line completion
        if random.random() < POWERUP_SPAWN_CHANCE:
            self.spawn_powerup()

        # 40% chance to spawn a fruit (independent of power-up spawn)
        if random.random() < FRUIT_SPAWN_CHANCE:
            self.spawn_fruit()

    def fail_line(self, line: GrowingLine) -> None:
        """A ball hit a growing line — remove it and lose a life.

        If shield is active, the line is protected: skip the failure.
        """
        if self.shield_active:
            # Shield absorbs the hit — line keeps growing
            return

        line.active = False
        if line in self.growing_lines:
            self.growing_lines.remove(line)
        self.lives -= 1
        self.line_failed = True
        # Consume lightning on failure too
        self.lightning_charges = max(0, self.lightning_charges - 1)
        if self.lives <= 0:
            self.state = "lost"

    # ------------------------------------------------------------------
    # Power-ups
    # ------------------------------------------------------------------

    def spawn_powerup(self) -> bool:
        """Spawn a random power-up at a valid position on the field.

        Returns True if a power-up was spawned, False otherwise.
        Caps at POWERUP_MAX_ON_FIELD items on the field.
        """
        if len(self.powerups) >= POWERUP_MAX_ON_FIELD:
            return False

        kinds = list(POWERUP_WEIGHTS.keys())
        weights = list(POWERUP_WEIGHTS.values())
        kind = random.choices(kinds, weights=weights, k=1)[0]
        margin = 40  # pixels from edges
        min_ball_dist = BALL_RADIUS * 6

        for _attempt in range(50):
            px = random.uniform(margin, self._width - margin)
            py = random.uniform(margin, self._height - margin)

            # Must be inside the play area shape
            if not self._is_point_inside_shape(px, py):
                continue

            # Not inside any filled region
            in_filled = False
            for region in self.filled_regions:
                rx, ry = region["x"], region["y"]
                rw, rh = region["width"], region["height"]
                if rx <= px <= rx + rw and ry <= py <= ry + rh:
                    in_filled = True
                    break
            if in_filled:
                continue

            # Not inside any obstacle
            if any(obs.contains_point(px, py) for obs in self.obstacles):
                continue

            # Not too close to any ball
            too_close = False
            for ball in self.balls:
                dx = px - ball.x
                dy = py - ball.y
                if math.sqrt(dx * dx + dy * dy) < min_ball_dist:
                    too_close = True
                    break
            if too_close:
                continue

            self._powerup_id_counter += 1
            powerup = PowerUp(px, py, kind, self._powerup_id_counter)
            self.powerups.append(powerup)
            return True

        return False

    def _spawn_jackpot(self) -> bool:
        """Spawn a single jackpot power-up at a random valid position.

        Called at level start when the 1% JACKPOT_SPAWN_CHANCE roll succeeds.
        """
        margin = 40
        for _attempt in range(50):
            px = random.uniform(margin, self._width - margin)
            py = random.uniform(margin, self._height - margin)
            if not self._is_point_inside_shape(px, py):
                continue
            self._powerup_id_counter += 1
            powerup = PowerUp(px, py, "jackpot", self._powerup_id_counter)
            self.powerups.append(powerup)
            return True
        return False

    def _maybe_spawn_jackpot(self) -> None:
        """Roll for a jackpot spawn at level start (1% chance)."""
        if random.random() < JACKPOT_SPAWN_CHANCE:
            self._spawn_jackpot()

    def check_powerup_captures(self) -> None:
        """Check if any active power-ups or fruits are inside filled regions.

        Called after recalculate_territory(). Captured power-ups apply
        their effect immediately. Captured fruits add bonus points.
        """
        remaining: List[PowerUp] = []
        for powerup in self.powerups:
            captured = False
            for region in self.filled_regions:
                rx, ry = region["x"], region["y"]
                rw, rh = region["width"], region["height"]
                if rx <= powerup.x <= rx + rw and ry <= powerup.y <= ry + rh:
                    captured = True
                    break

            if captured:
                powerup.active = False
                kind = powerup.kind

                # Mystery resolves to a random other kind
                resolved_kind: Optional[str] = None
                if kind == "mystery":
                    resolved_kind = random.choice(["heart", "clock", "shield", "lightning", "bomb", "freeze", "shrink", "skull", "grow", "fusion", "fission_pu", "wave", "web", "portal", "sinkhole", "snake", "nuke"])
                    kind = resolved_kind

                event: Dict[str, Any] = {
                    "kind": kind,
                    "id": powerup.item_id,
                    "x": powerup.x,
                    "y": powerup.y,
                }
                if resolved_kind is not None:
                    event["resolved_kind"] = resolved_kind

                self._apply_powerup_effect(kind, event)
                self.powerup_events.append(event)
            else:
                remaining.append(powerup)

        self.powerups = remaining

        # Check fruit captures
        remaining_fruits: List[PowerUp] = []
        for fruit in self.fruits:
            captured = False
            for region in self.filled_regions:
                rx, ry = region["x"], region["y"]
                rw, rh = region["width"], region["height"]
                if rx <= fruit.x <= rx + rw and ry <= fruit.y <= ry + rh:
                    captured = True
                    break

            if captured:
                fruit.active = False
                points = FRUIT_POINTS.get(fruit.kind, 0)
                self.score += points
                event = {
                    "kind": fruit.kind,
                    "id": fruit.item_id,
                    "x": fruit.x,
                    "y": fruit.y,
                    "is_fruit": True,
                    "points": points,
                }
                self.powerup_events.append(event)
            else:
                remaining_fruits.append(fruit)

        self.fruits = remaining_fruits

    def _apply_powerup_effect(self, kind: str, event: Dict[str, Any]) -> None:
        """Apply the effect of a captured power-up by kind."""
        if kind == "heart":
            self.lives += 1
        elif kind == "clock":
            self._apply_slow_effect()
        elif kind == "shield":
            self.shield_active = True
        elif kind == "lightning":
            self.lightning_charges += 3
        elif kind == "bomb":
            if len(self.balls) > 1:
                removed = self.balls.pop(random.randrange(len(self.balls)))
                self._cleanup_ball_refs(removed)
                event["removed_ball"] = {"x": removed.x, "y": removed.y}
        elif kind == "freeze":
            self._apply_freeze_effect()
        elif kind == "shrink":
            self._apply_shrink_effect()
        elif kind == "grow":
            self._apply_grow_effect()
        elif kind == "skull":
            self.lives -= 1
            if self.lives <= 0:
                self.state = "lost"
        elif kind == "fusion":
            self._apply_fusion_effect()
        elif kind == "fission_pu":
            self._apply_fission_pu_effect()
        elif kind == "wave":
            self._apply_wave_effect()
        elif kind == "web":
            self._apply_web_effect()
        elif kind == "portal":
            self._apply_portal_effect()
        elif kind == "sinkhole":
            self._apply_sinkhole_effect()
        elif kind == "magnet":
            self._apply_magnet_effect()
        elif kind == "snake":
            self._apply_snake_effect(event)
        elif kind == "nuke":
            self._apply_nuke_effect(event)
        elif kind == "candy":
            self.score += 2000
            event["points"] = 2000
        elif kind == "jackpot":
            self._apply_jackpot_effect(event)
        elif kind == "fire":
            self.fire_active = True
        elif kind == "acid":
            self._apply_acid_effect()
        elif kind == "anchor":
            self.anchor_active = True

    def _apply_nuke_effect(self, event: Dict[str, Any]) -> None:
        """Atomic bomb: destroys all balls within blast radius."""
        event_x = event["x"]
        event_y = event["y"]
        blast_radius = NUKE_BLAST_RADIUS

        survivors = []
        destroyed_balls = []
        destroyed = []
        for ball in self.balls:
            dx = ball.x - event_x
            dy = ball.y - event_y
            if math.sqrt(dx * dx + dy * dy) <= blast_radius:
                destroyed.append({"x": ball.x, "y": ball.y})
                destroyed_balls.append(ball)
            else:
                survivors.append(ball)

        # Keep at least 1 ball
        if survivors:
            self.balls = survivors
        elif destroyed:
            self.balls = [self.balls[0]]
            destroyed = destroyed[1:]
            destroyed_balls = destroyed_balls[1:]

        for ball in destroyed_balls:
            self._cleanup_ball_refs(ball)

        event["blast"] = {
            "x": event_x,
            "y": event_y,
            "radius": blast_radius,
            "destroyed": destroyed,
        }

    def _apply_jackpot_effect(self, event: Dict[str, Any]) -> None:
        """Instant win: fill to 100%, set state to won, calculate score."""
        self.fill_percentage = 100.0
        # Mark entire play area as filled
        self.filled_regions = [{
            "x": 0, "y": 0,
            "width": self._width, "height": self._height,
            "cell_count": (self._width // GRID_CELL_SIZE) * (self._height // GRID_CELL_SIZE),
        }]
        self.state = "won"
        self.calculate_level_score()

    def _apply_slow_effect(self) -> None:
        """Halve all ball speeds and start the slow timer."""
        if not self.is_slowed:
            for ball in self.balls:
                ball.vx *= CLOCK_SLOW_FACTOR
                ball.vy *= CLOCK_SLOW_FACTOR
        self.slow_timer = CLOCK_SLOW_DURATION
        self.is_slowed = True

    def update_slow_effect(self, dt: float) -> None:
        """Tick down the slow timer and restore speeds when it expires."""
        if self.slow_timer <= 0.0:
            return
        self.slow_timer -= dt
        if self.slow_timer <= 0.0:
            self.slow_timer = 0.0
            self.is_slowed = False
            # Restore ball speeds (undo halving)
            restore_factor = 1.0 / CLOCK_SLOW_FACTOR
            for ball in self.balls:
                ball.vx *= restore_factor
                ball.vy *= restore_factor

    def _apply_freeze_effect(self) -> None:
        """Freeze all balls in place."""
        self.freeze_timer = FREEZE_DURATION
        self.is_frozen = True

    def update_freeze_effect(self, dt: float) -> None:
        """Tick down the freeze timer and unfreeze when it expires."""
        if self.freeze_timer <= 0.0:
            return
        self.freeze_timer -= dt
        if self.freeze_timer <= 0.0:
            self.freeze_timer = 0.0
            self.is_frozen = False

    def _apply_shrink_effect(self) -> None:
        """Shrink all balls to half radius."""
        # If grow is active, cancel it first (latest effect wins)
        if self.is_grown:
            self._restore_grow_radii()
            self.grow_timer = 0.0
            self.is_grown = False
            self._grow_original_radii.clear()
        if not self.is_shrunk:
            self._original_radii = {id(ball): ball.radius for ball in self.balls}
            for ball in self.balls:
                ball.radius = ball.radius * SHRINK_FACTOR
        self.shrink_timer = SHRINK_DURATION
        self.is_shrunk = True

    def _restore_radii(self) -> None:
        """Restore original ball radii if shrink is active."""
        if self.is_shrunk and self._original_radii:
            for ball in self.balls:
                orig = self._original_radii.get(id(ball))
                if orig is not None:
                    ball.radius = orig
            self._original_radii.clear()

    def update_shrink_effect(self, dt: float) -> None:
        """Tick down the shrink timer and restore radii when it expires."""
        if self.shrink_timer <= 0.0:
            return
        self.shrink_timer -= dt
        if self.shrink_timer <= 0.0:
            self.shrink_timer = 0.0
            self._restore_radii()
            self.is_shrunk = False

    def _apply_grow_effect(self) -> None:
        """Grow all balls to 3x radius (hazard — bigger = harder to avoid)."""
        # If shrink is active, cancel it first (latest effect wins)
        if self.is_shrunk:
            self._restore_radii()
            self.shrink_timer = 0.0
            self.is_shrunk = False
            self._original_radii.clear()
        if not self.is_grown:
            self._grow_original_radii = {id(ball): ball.radius for ball in self.balls}
            for ball in self.balls:
                ball.radius = ball.radius * GROW_FACTOR
        self.grow_timer = GROW_DURATION
        self.is_grown = True

    def _restore_grow_radii(self) -> None:
        """Restore original ball radii if grow is active."""
        if self.is_grown and self._grow_original_radii:
            for ball in self.balls:
                orig = self._grow_original_radii.get(id(ball))
                if orig is not None:
                    ball.radius = orig
            self._grow_original_radii.clear()

    def update_grow_effect(self, dt: float) -> None:
        """Tick down the grow timer and restore radii when it expires."""
        if self.grow_timer <= 0.0:
            return
        self.grow_timer -= dt
        if self.grow_timer <= 0.0:
            self.grow_timer = 0.0
            self._restore_grow_radii()
            self.is_grown = False

    def _apply_fusion_effect(self) -> None:
        """Activate fusion mode — colliding balls merge instead of bouncing."""
        self.fusion_timer = FUSION_DURATION
        self.is_fusion = True

    def update_fusion_effect(self, dt: float) -> None:
        """Tick down the fusion timer and deactivate when expired."""
        if self.fusion_timer <= 0.0:
            return
        self.fusion_timer -= dt
        if self.fusion_timer <= 0.0:
            self.fusion_timer = 0.0
            self.is_fusion = False

    def _apply_fission_pu_effect(self) -> None:
        """Activate fission power-up — 100% fission chance on ball collisions."""
        self.fission_pu_timer = FISSION_PU_DURATION
        self.is_fission_active = True

    def update_fission_pu_effect(self, dt: float) -> None:
        """Tick down the fission power-up timer and deactivate when expired."""
        if self.fission_pu_timer <= 0.0:
            return
        self.fission_pu_timer -= dt
        if self.fission_pu_timer <= 0.0:
            self.fission_pu_timer = 0.0
            self.is_fission_active = False

    def _apply_wave_effect(self) -> None:
        """Activate wave mode — balls oscillate in sine-wave patterns."""
        self.wave_timer = WAVE_DURATION
        self.is_wave = True
        self.wave_elapsed = 0.0

    def update_wave_effect(self, dt: float) -> None:
        """Tick down the wave timer, advance elapsed, and deactivate when expired."""
        if self.wave_timer <= 0.0:
            return
        self.wave_timer -= dt
        self.wave_elapsed += dt
        if self.wave_timer <= 0.0:
            self.wave_timer = 0.0
            self.wave_elapsed = 0.0
            self.is_wave = False

    def _apply_web_effect(self) -> None:
        """Spawn 2-3 web zones at random valid positions in the active play area."""
        count = random.randint(WEB_ZONE_COUNT_MIN, WEB_ZONE_COUNT_MAX)
        margin = WEB_ZONE_RADIUS + 10

        for _ in range(count):
            for _attempt in range(50):
                px = random.uniform(margin, self._width - margin)
                py = random.uniform(margin, self._height - margin)

                # Not inside any filled region
                in_filled = False
                for region in self.filled_regions:
                    rx, ry = region["x"], region["y"]
                    rw, rh = region["width"], region["height"]
                    if rx <= px <= rx + rw and ry <= py <= ry + rh:
                        in_filled = True
                        break
                if in_filled:
                    continue

                self.web_zones.append(WebZone(px, py, WEB_ZONE_RADIUS, WEB_DURATION))
                break

    def update_web_zones(self, dt: float) -> None:
        """Update web zone timers and apply/remove slow effects on balls."""
        # Decrement zone timers and remove expired zones
        remaining_zones: List[WebZone] = []
        for zone in self.web_zones:
            zone.timer -= dt
            if zone.timer > 0:
                remaining_zones.append(zone)
        self.web_zones = remaining_zones

        # Track which balls are currently in any web zone
        currently_in_web: set = set()
        for ball in self.balls:
            ball_id = id(ball)
            in_zone = any(zone.contains(ball) for zone in self.web_zones)

            if in_zone:
                currently_in_web.add(ball_id)
                if ball_id not in self._balls_in_web:
                    # Ball just entered a web zone — slow it down
                    speed = math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy)
                    if speed > 0 and ball_id not in self._ball_original_speeds:
                        self._ball_original_speeds[ball_id] = speed
                        target_speed = speed * WEB_SLOW_FACTOR
                        factor = target_speed / speed
                        ball.vx *= factor
                        ball.vy *= factor
                # Remove any linger timer since ball is back in a zone
                self.ball_web_timers.pop(ball_id, None)
            else:
                if ball_id in self._balls_in_web:
                    # Ball just left a web zone — start linger timer
                    self.ball_web_timers[ball_id] = WEB_LINGER_DURATION

        self._balls_in_web = currently_in_web

        # Tick linger timers for balls outside web zones
        expired_lingers: List[int] = []
        for ball_id, remaining in list(self.ball_web_timers.items()):
            remaining -= dt
            if remaining <= 0:
                expired_lingers.append(ball_id)
            else:
                self.ball_web_timers[ball_id] = remaining

        # Restore speed for balls whose linger has expired
        for ball_id in expired_lingers:
            self.ball_web_timers.pop(ball_id, None)
            orig_speed = self._ball_original_speeds.pop(ball_id, None)
            if orig_speed is not None:
                # Find the ball by id
                for ball in self.balls:
                    if id(ball) == ball_id:
                        current_speed = math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy)
                        if current_speed > 0:
                            factor = orig_speed / current_speed
                            ball.vx *= factor
                            ball.vy *= factor
                        break

        # Clean up stale entries for balls that no longer exist
        live_ball_ids = {id(b) for b in self.balls}
        stale = [bid for bid in self._ball_original_speeds if bid not in live_ball_ids]
        for bid in stale:
            self._ball_original_speeds.pop(bid, None)
            self.ball_web_timers.pop(bid, None)
            self._balls_in_web.discard(bid)

    def _apply_portal_effect(self) -> None:
        """Spawn a pair of portals at random valid positions in the active play area."""
        margin = PORTAL_RADIUS + 20
        min_separation = 200.0

        pos_a = None
        pos_b = None

        for _attempt in range(100):
            ax = random.uniform(margin, self._width - margin)
            ay = random.uniform(margin, self._height - margin)

            # Not inside any filled region
            in_filled = False
            for region in self.filled_regions:
                rx, ry = region["x"], region["y"]
                rw, rh = region["width"], region["height"]
                if rx <= ax <= rx + rw and ry <= ay <= ry + rh:
                    in_filled = True
                    break
            if in_filled:
                continue
            pos_a = (ax, ay)
            break

        if pos_a is None:
            return

        for _attempt in range(100):
            bx = random.uniform(margin, self._width - margin)
            by = random.uniform(margin, self._height - margin)

            # Not inside any filled region
            in_filled = False
            for region in self.filled_regions:
                rx, ry = region["x"], region["y"]
                rw, rh = region["width"], region["height"]
                if rx <= bx <= rx + rw and ry <= by <= ry + rh:
                    in_filled = True
                    break
            if in_filled:
                continue

            # Must be at least min_separation apart from portal A
            dx = bx - pos_a[0]
            dy = by - pos_a[1]
            if math.sqrt(dx * dx + dy * dy) < min_separation:
                continue

            pos_b = (bx, by)
            break

        if pos_b is None:
            return

        # Replace existing pair if one exists
        self.portal_pair = PortalPair(pos_a[0], pos_a[1], pos_b[0], pos_b[1], PORTAL_DURATION)
        self.ball_portal_cooldowns.clear()

    def _apply_sinkhole_effect(self) -> None:
        """Spawn a sinkhole at a random valid position in the active play area."""
        margin = SINKHOLE_PULL_RADIUS + 10

        for _attempt in range(100):
            sx = random.uniform(margin, self._width - margin)
            sy = random.uniform(margin, self._height - margin)

            # Not inside any filled region
            in_filled = False
            for region in self.filled_regions:
                rx, ry = region["x"], region["y"]
                rw, rh = region["width"], region["height"]
                if rx <= sx <= rx + rw and ry <= sy <= ry + rh:
                    in_filled = True
                    break
            if in_filled:
                continue

            # Replace existing sinkhole (max 1 at a time)
            self.sinkhole = Sinkhole(sx, sy, SINKHOLE_RADIUS, SINKHOLE_PULL_RADIUS, SINKHOLE_DURATION)
            return

    def update_sinkhole(self, dt: float) -> None:
        """Update sinkhole timer, apply gravitational pull, and destroy captured balls."""
        self.sinkhole_events.clear()

        if self.sinkhole is None:
            return

        # Decrement timer
        self.sinkhole.timer -= dt
        if self.sinkhole.timer <= 0:
            self.sinkhole = None
            return

        cx, cy = self.sinkhole.x, self.sinkhole.y
        pull_r_sq = self.sinkhole.pull_radius * self.sinkhole.pull_radius
        destroy_r_sq = self.sinkhole.radius * self.sinkhole.radius

        destroyed: List[int] = []

        for i, ball in enumerate(self.balls):
            dx = cx - ball.x
            dy = cy - ball.y
            dist_sq = dx * dx + dy * dy

            if dist_sq <= destroy_r_sq and len(self.balls) - len(destroyed) > 1:
                # Ball is inside sinkhole — mark for destruction
                destroyed.append(i)
                self.sinkhole_events.append({"x": ball.x, "y": ball.y})
            elif dist_sq <= pull_r_sq and dist_sq > 0:
                # Ball is within pull radius — apply gentle gravitational pull
                dist = math.sqrt(dist_sq)
                nx = dx / dist
                ny = dy / dist
                ball.vx += nx * SINKHOLE_PULL_FORCE * dt
                ball.vy += ny * SINKHOLE_PULL_FORCE * dt

        # Remove destroyed balls in reverse order to preserve indices
        for i in reversed(destroyed):
            self._cleanup_ball_refs(self.balls[i])
            self.balls.pop(i)

    def _apply_magnet_effect(self) -> None:
        """Spawn a magnet at a random valid position in the active play area."""
        magnet_pull_radius = 200.0
        margin = magnet_pull_radius + 10

        for _attempt in range(100):
            mx = random.uniform(margin, self._width - margin)
            my = random.uniform(margin, self._height - margin)

            # Not inside any filled region
            in_filled = False
            for region in self.filled_regions:
                rx, ry = region["x"], region["y"]
                rw, rh = region["width"], region["height"]
                if rx <= mx <= rx + rw and ry <= my <= ry + rh:
                    in_filled = True
                    break
            if in_filled:
                continue

            # Replace existing magnet (max 1 at a time)
            self.magnet = Magnet(mx, my, MAGNET_DURATION)
            return

    def update_magnet(self, dt: float) -> None:
        """Update magnet timer and apply pull force to all balls (no destruction)."""
        if self.magnet is None:
            return

        # Decrement timer
        self.magnet.timer -= dt
        if self.magnet.timer <= 0:
            self.magnet = None
            return

        cx, cy = self.magnet.x, self.magnet.y
        pull_radius = 200.0
        stick_radius = 20.0
        pull_r_sq = pull_radius * pull_radius

        for ball in self.balls:
            dx = cx - ball.x
            dy = cy - ball.y
            dist_sq = dx * dx + dy * dy

            if dist_sq <= 0:
                continue

            if dist_sq <= pull_r_sq:
                dist = math.sqrt(dist_sq)
                nx = dx / dist
                ny = dy / dist

                if dist <= stick_radius:
                    # Ball is very close — "stick" it by dramatically damping velocity
                    ball.vx *= 0.85
                    ball.vy *= 0.85
                    # Gentle pull to keep it clustered at center
                    ball.vx += nx * MAGNET_PULL_FORCE * 0.3 * dt
                    ball.vy += ny * MAGNET_PULL_FORCE * 0.3 * dt
                else:
                    # Strong pull toward magnet center
                    ball.vx += nx * MAGNET_PULL_FORCE * dt
                    ball.vy += ny * MAGNET_PULL_FORCE * dt

    def _apply_snake_effect(self, event: Dict[str, Any]) -> None:
        """Spawn a snake in the active (unfilled) play area near a ball."""
        spawn_x, spawn_y = self._width / 2, self._height / 2

        if self.balls:
            # Try spawning near each ball, pick first that's in active area
            candidates = list(self.balls)
            random.shuffle(candidates)
            for target in candidates:
                offset = 80
                angle = random.uniform(0, 2 * math.pi)
                x = target.x + math.cos(angle) * offset
                y = target.y + math.sin(angle) * offset
                x = max(20, min(self._width - 20, x))
                y = max(20, min(self._height - 20, y))
                if not self._is_point_in_filled(x, y):
                    spawn_x, spawn_y = x, y
                    break

        # Max 1 snake at a time — replace any existing one
        self.snake = Snake(spawn_x, spawn_y)

    def update_snake(self, dt: float) -> None:
        """Update snake: move toward nearest ball, eat on contact, expire timer."""
        self.snake_eat_events.clear()

        if self.snake is None or not self.snake.active:
            return

        snake = self.snake
        snake.eat_events.clear()

        # Decrement timer
        snake.timer -= dt
        snake.elapsed += dt
        if snake.timer <= 0:
            snake.active = False
            self.snake = None
            return

        # Find nearest ball
        if not self.balls:
            return

        head = snake.segments[0]
        nearest_ball = None
        nearest_dist_sq = float('inf')
        for ball in self.balls:
            dx = ball.x - head['x']
            dy = ball.y - head['y']
            dist_sq = dx * dx + dy * dy
            if dist_sq < nearest_dist_sq:
                nearest_dist_sq = dist_sq
                nearest_ball = ball

        if nearest_ball is None:
            return

        # Move head toward nearest ball with sinusoidal wobble
        dx = nearest_ball.x - head['x']
        dy = nearest_ball.y - head['y']
        dist = math.sqrt(dx * dx + dy * dy)
        if dist > 0:
            base_angle = math.atan2(dy, dx)
            wobble = math.sin(snake.elapsed * 5.0) * 0.3
            angle = base_angle + wobble
            move_dist = SNAKE_SPEED * dt
            new_x = head['x'] + math.cos(angle) * move_dist
            new_y = head['y'] + math.sin(angle) * move_dist

            # Clamp to play area bounds
            new_x = max(10, min(self._width - 10, new_x))
            new_y = max(10, min(self._height - 10, new_y))

            head['x'] = new_x
            head['y'] = new_y

        # Store head position in history
        snake.position_history.append({'x': head['x'], 'y': head['y']})
        # Keep history long enough for all body segments
        max_history = SNAKE_SEGMENT_SPACING * (SNAKE_SEGMENT_COUNT - 1) + 1
        if len(snake.position_history) > max_history:
            snake.position_history = snake.position_history[-max_history:]

        # Update body segments: each follows the position the previous segment
        # was at N steps ago in the position history
        for i in range(1, len(snake.segments)):
            history_index = len(snake.position_history) - 1 - (i * SNAKE_SEGMENT_SPACING)
            if history_index >= 0:
                snake.segments[i] = {
                    'x': snake.position_history[history_index]['x'],
                    'y': snake.position_history[history_index]['y'],
                }

        # Bounce balls off snake body segments (skip head at index 0)
        for ball in self.balls:
            for seg in snake.segments[1:]:
                dx = ball.x - seg['x']
                dy = ball.y - seg['y']
                dist = math.sqrt(dx * dx + dy * dy)
                collision_radius = ball.radius + SNAKE_SEGMENT_RADIUS
                if dist < collision_radius and dist > 0:
                    nx = dx / dist
                    ny = dy / dist
                    dot = ball.vx * nx + ball.vy * ny
                    if dot < 0:
                        ball.vx -= 2 * dot * nx
                        ball.vy -= 2 * dot * ny
                    overlap = collision_radius - dist
                    ball.x += nx * overlap
                    ball.y += ny * overlap
                    break

        # Check eat distance
        eat_r_sq = SNAKE_EAT_RADIUS * SNAKE_EAT_RADIUS
        eaten_indices: List[int] = []
        for i, ball in enumerate(self.balls):
            bx = ball.x - head['x']
            by = ball.y - head['y']
            if bx * bx + by * by <= eat_r_sq and len(self.balls) - len(eaten_indices) > 1:
                eaten_indices.append(i)
                eat_ev = {"x": ball.x, "y": ball.y}
                snake.eat_events.append(eat_ev)
                self.snake_eat_events.append(eat_ev)

        # Remove eaten balls in reverse order
        for i in reversed(eaten_indices):
            self._cleanup_ball_refs(self.balls[i])
            self.balls.pop(i)

    def _is_point_in_filled(self, x: float, y: float) -> bool:
        """Return True if the point is inside any filled region."""
        for region in self.filled_regions:
            rx, ry = region["x"], region["y"]
            rw, rh = region["width"], region["height"]
            if rx <= x <= rx + rw and ry <= y <= ry + rh:
                return True
        return False

    def _apply_acid_effect(self) -> None:
        """Spawn acid pools at random valid positions in the active play area."""
        count = random.randint(ACID_POOL_COUNT_MIN, ACID_POOL_COUNT_MAX)
        margin = ACID_POOL_RADIUS + 10

        for _ in range(count):
            for _attempt in range(50):
                px = random.uniform(margin, self._width - margin)
                py = random.uniform(margin, self._height - margin)

                if self._is_point_in_filled(px, py):
                    continue

                self.acid_pools.append(AcidPool(px, py, ACID_POOL_RADIUS, ACID_DURATION))
                break

    def update_acid_pools(self, dt: float) -> None:
        """Update acid pool timers and dissolve balls that enter pools."""
        self.acid_dissolve_events.clear()

        if not self.acid_pools:
            return

        # Decrement timers and remove expired pools
        remaining: List[AcidPool] = []
        for pool in self.acid_pools:
            pool.timer -= dt
            if pool.timer > 0:
                remaining.append(pool)
        self.acid_pools = remaining

        # Check ball-pool collisions
        destroyed: List[int] = []
        for pool in self.acid_pools:
            r_sq = pool.radius * pool.radius
            for i, ball in enumerate(self.balls):
                if i in destroyed:
                    continue
                dx = ball.x - pool.x
                dy = ball.y - pool.y
                if dx * dx + dy * dy <= r_sq and len(self.balls) - len(destroyed) > 1:
                    destroyed.append(i)
                    self.acid_dissolve_events.append({"x": ball.x, "y": ball.y})

        # Remove dissolved balls in reverse order to preserve indices
        for i in sorted(destroyed, reverse=True):
            self._cleanup_ball_refs(self.balls[i])
            self.balls.pop(i)

    def update_portals(self, dt: float) -> None:
        """Update portal pair timer and teleport balls entering portals."""
        self.portal_events.clear()

        if self.portal_pair is None:
            return

        # Decrement timer
        self.portal_pair.timer -= dt
        if self.portal_pair.timer <= 0:
            self.portal_pair = None
            self.ball_portal_cooldowns.clear()
            return

        # Decrement per-ball cooldowns
        expired_cooldowns: List[int] = []
        for ball_id, remaining in list(self.ball_portal_cooldowns.items()):
            remaining -= dt
            if remaining <= 0:
                expired_cooldowns.append(ball_id)
            else:
                self.ball_portal_cooldowns[ball_id] = remaining
        for ball_id in expired_cooldowns:
            del self.ball_portal_cooldowns[ball_id]

        portal_a = self.portal_pair.a
        portal_b = self.portal_pair.b
        radius_sq = PORTAL_RADIUS * PORTAL_RADIUS
        angle_offset_rad = math.radians(PORTAL_ANGLE_OFFSET)

        for ball in self.balls:
            ball_id = id(ball)
            if self.ball_portal_cooldowns.get(ball_id, 0) > 0:
                continue

            # Check distance to portal A
            dx_a = ball.x - portal_a["x"]
            dy_a = ball.y - portal_a["y"]
            dist_a_sq = dx_a * dx_a + dy_a * dy_a

            # Check distance to portal B
            dx_b = ball.x - portal_b["x"]
            dy_b = ball.y - portal_b["y"]
            dist_b_sq = dx_b * dx_b + dy_b * dy_b

            teleported = False
            from_pos = None
            to_pos = None

            old_x, old_y = ball.x, ball.y

            if dist_a_sq <= radius_sq:
                # Teleport to portal B
                from_pos = {"x": ball.x, "y": ball.y}
                ball.x = max(BALL_RADIUS, min(portal_b["x"], self._width - BALL_RADIUS))
                ball.y = max(BALL_RADIUS, min(portal_b["y"], self._height - BALL_RADIUS))
                to_pos = {"x": ball.x, "y": ball.y}
                teleported = True
            elif dist_b_sq <= radius_sq:
                # Teleport to portal A
                from_pos = {"x": ball.x, "y": ball.y}
                ball.x = max(BALL_RADIUS, min(portal_a["x"], self._width - BALL_RADIUS))
                ball.y = max(BALL_RADIUS, min(portal_a["y"], self._height - BALL_RADIUS))
                to_pos = {"x": ball.x, "y": ball.y}
                teleported = True

            # Verify destination is inside play area shape
            if teleported and not self._is_point_inside_shape(ball.x, ball.y):
                # Destination outside shape — revert teleport
                ball.x = old_x
                ball.y = old_y
                teleported = False
                # Still set cooldown to prevent repeated attempts
                self.ball_portal_cooldowns[ball_id] = PORTAL_COOLDOWN

            if teleported:
                # Apply random angular offset to velocity
                speed = math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy)
                if speed > 0:
                    current_angle = math.atan2(ball.vy, ball.vx)
                    offset = random.uniform(-angle_offset_rad, angle_offset_rad)
                    new_angle = current_angle + offset
                    ball.vx = speed * math.cos(new_angle)
                    ball.vy = speed * math.sin(new_angle)

                self.ball_portal_cooldowns[ball_id] = PORTAL_COOLDOWN
                self.portal_events.append({
                    "from": from_pos,
                    "to": to_pos,
                    "ball_id": ball_id,
                })

        # Clean up stale cooldowns for balls that no longer exist
        live_ball_ids = {id(b) for b in self.balls}
        stale = [bid for bid in self.ball_portal_cooldowns if bid not in live_ball_ids]
        for bid in stale:
            del self.ball_portal_cooldowns[bid]

    def spawn_fruit(self) -> bool:
        """Spawn a random fruit at a valid position on the field.

        Returns True if a fruit was spawned, False otherwise.
        Caps at FRUIT_MAX_ON_FIELD items on the field.
        """
        if len(self.fruits) >= FRUIT_MAX_ON_FIELD:
            return False

        kinds = list(FRUIT_WEIGHTS.keys())
        weights = list(FRUIT_WEIGHTS.values())
        kind = random.choices(kinds, weights=weights, k=1)[0]
        margin = 40
        min_ball_dist = BALL_RADIUS * 6

        for _attempt in range(50):
            px = random.uniform(margin, self._width - margin)
            py = random.uniform(margin, self._height - margin)

            # Must be inside the play area shape
            if not self._is_point_inside_shape(px, py):
                continue

            in_filled = False
            for region in self.filled_regions:
                rx, ry = region["x"], region["y"]
                rw, rh = region["width"], region["height"]
                if rx <= px <= rx + rw and ry <= py <= ry + rh:
                    in_filled = True
                    break
            if in_filled:
                continue

            # Not inside any obstacle
            if any(obs.contains_point(px, py) for obs in self.obstacles):
                continue

            too_close = False
            for ball in self.balls:
                dx = px - ball.x
                dy = py - ball.y
                if math.sqrt(dx * dx + dy * dy) < min_ball_dist:
                    too_close = True
                    break
            if too_close:
                continue

            self._powerup_id_counter += 1
            fruit = PowerUp(px, py, kind, self._powerup_id_counter)
            self.fruits.append(fruit)
            return True

        return False

    # ------------------------------------------------------------------
    # Timer & scoring
    # ------------------------------------------------------------------

    def update_timer(self, dt: float) -> None:
        """Decrement the level timer by *dt* seconds, clamped at 0."""
        self.level_timer = max(0.0, self.level_timer - dt)

    def calculate_level_score(self) -> Dict[str, int]:
        """Compute the full score breakdown for completing the current level.

        Called when the level is won. Adds the total to ``self.score``
        and stores the breakdown in ``self.level_score_breakdown``.
        """
        time_remaining = self.level_timer
        if time_remaining <= 0:
            time_bonus = 0
        else:
            time_bonus = int(TIME_BONUS_BASE * math.exp(-TIME_BONUS_DECAY * (LEVEL_TIME_LIMIT - time_remaining)))

        lives_bonus = self.lives * LIFE_BONUS_POINTS

        efficiency_bonus = max(0, EFFICIENCY_BONUS_BASE - (self.lines_drawn - 1) * EFFICIENCY_BONUS_PENALTY)

        fill_bonus = int(self.fill_percentage * 10)

        total = time_bonus + lives_bonus + efficiency_bonus + fill_bonus

        breakdown: Dict[str, int] = {
            "time_bonus": time_bonus,
            "lives_bonus": lives_bonus,
            "efficiency_bonus": efficiency_bonus,
            "fill_bonus": fill_bonus,
            "total": total,
        }

        self.score += total
        self.level_score_breakdown = breakdown
        return breakdown

    # ------------------------------------------------------------------
    # Ball-ball collisions & fission
    # ------------------------------------------------------------------

    def check_ball_collisions(self) -> List[Dict[str, float]]:
        """Check all ball pairs for collisions, resolve them, and spawn
        fission balls at collision points (up to MAX_BALLS).

        When fusion mode is active, colliding balls MERGE instead of
        bouncing/fissioning (never below 1 ball).

        Fission is skipped (bounce still happens) if either ball has a
        non-zero ``fission_cooldown``.

        Returns a list of collision-point dicts ``{"x": …, "y": …}``.
        Also stores them in ``self.ball_collision_events`` for the tick.
        """
        collision_points: List[Dict[str, float]] = []
        merge_events: List[Dict[str, float]] = []
        balls = self.balls
        n = len(balls)

        # Build play-area wall dict for post-separation clamping
        w, h = self._width, self._height
        play_area_walls = {
            "left":   {"x1": 0, "y1": 0, "x2": 0, "y2": h},
            "top":    {"x1": 0, "y1": 0, "x2": w, "y2": 0},
            "right":  {"x1": w, "y1": 0, "x2": w, "y2": h},
            "bottom": {"x1": 0, "y1": h, "x2": w, "y2": h},
        }

        if self.is_fusion:
            # Fusion mode: merge colliding balls instead of bouncing
            balls_to_remove: set = set()
            balls_to_add: List[Ball] = []

            for i in range(n):
                for j in range(i + 1, n):
                    if i in balls_to_remove or j in balls_to_remove:
                        continue
                    if check_ball_ball_collision(balls[i], balls[j], play_area_walls):
                        # Never merge below 1 ball
                        remaining = n - len(balls_to_remove) + len(balls_to_add)
                        if remaining <= 1:
                            continue
                        mid_x = (balls[i].x + balls[j].x) / 2.0
                        mid_y = (balls[i].y + balls[j].y) / 2.0
                        # Area-preserving radius: sqrt(r1² + r2²)
                        merged_radius = math.sqrt(balls[i].radius ** 2 + balls[j].radius ** 2)
                        merged_radius = min(merged_radius, FUSION_MAX_RADIUS)
                        avg_vx = (balls[i].vx + balls[j].vx) / 2.0
                        avg_vy = (balls[i].vy + balls[j].vy) / 2.0

                        merged_ball = Ball(
                            x=mid_x, y=mid_y,
                            vx=avg_vx, vy=avg_vy,
                            radius=merged_radius,
                        )
                        balls_to_remove.add(i)
                        balls_to_remove.add(j)
                        balls_to_add.append(merged_ball)
                        merge_events.append({"x": mid_x, "y": mid_y})

            if balls_to_remove:
                self.balls = [b for idx, b in enumerate(balls) if idx not in balls_to_remove]
                self.balls.extend(balls_to_add)

            self.ball_merge_events = merge_events
            self.ball_collision_events = collision_points
            return collision_points

        # Normal mode: bounce + fission
        fission_pairs: List[tuple] = []
        collided_indices: set = set()

        for i in range(n):
            for j in range(i + 1, n):
                if check_ball_ball_collision(balls[i], balls[j], play_area_walls):
                    mid_x = (balls[i].x + balls[j].x) / 2.0
                    mid_y = (balls[i].y + balls[j].y) / 2.0
                    collision_points.append({"x": mid_x, "y": mid_y})
                    collided_indices.add(i)
                    collided_indices.add(j)
                    # Only queue fission if both balls have recovered
                    if balls[i].fission_cooldown <= 0 and balls[j].fission_cooldown <= 0:
                        if self.is_fission_active or random.random() < 0.01:
                            fission_pairs.append((i, j, mid_x, mid_y))

        # After ALL collision resolutions, clamp every collided ball to play area
        for idx in collided_indices:
            self._clamp_ball_to_play_area(balls[idx])

        # Fission: spawn one new ball per eligible collision (cap at MAX_BALLS)
        for idx_i, idx_j, fx, fy in fission_pairs:
            if len(self.balls) >= MAX_BALLS:
                break
            # Density check: skip fission if too many balls nearby
            nearby = sum(
                1 for b in self.balls
                if math.sqrt((b.x - fx) ** 2 + (b.y - fy) ** 2) <= FISSION_DENSITY_RADIUS
            )
            if nearby >= FISSION_DENSITY_MAX:
                continue
            avg_speed = sum(
                math.sqrt(b.vx ** 2 + b.vy ** 2) for b in self.balls
            ) / max(len(self.balls), 1)
            angle = random.uniform(0, 2 * math.pi)
            new_ball = Ball(
                x=fx,
                y=fy,
                vx=avg_speed * math.cos(angle),
                vy=avg_speed * math.sin(angle),
                radius=BALL_RADIUS,
            )
            new_ball.fission_cooldown = FISSION_COOLDOWN
            balls[idx_i].fission_cooldown = FISSION_COOLDOWN
            balls[idx_j].fission_cooldown = FISSION_COOLDOWN
            self.balls.append(new_ball)

        self.ball_merge_events = []
        self.ball_collision_events = collision_points
        return collision_points

    # ------------------------------------------------------------------
    # Territory calculation (Phase 5)
    # ------------------------------------------------------------------

    def recalculate_territory(self) -> None:
        """Rebuild the territory grid, flood-fill from ball positions,
        mark enclosed regions as filled, and update fill_percentage.
        """
        self.territory_recalc_needed = False
        cell_size = GRID_CELL_SIZE
        gw = self._width // cell_size
        gh = self._height // cell_size

        grid = Grid(gw, gh)

        # Scale boundary coordinates to grid space and rasterize
        scaled_boundaries = [
            {
                "x1": b["x1"] / cell_size,
                "y1": b["y1"] / cell_size,
                "x2": b["x2"] / cell_size,
                "y2": b["y2"] / cell_size,
            }
            for b in self.boundaries
        ]
        grid.rasterize_boundaries(scaled_boundaries)

        # Mark cells inside obstacles as WALL so flood fill treats them
        # as already-filled territory. Use bounding box to limit checks.
        for obs in self.obstacles:
            xs = [v["x"] for v in obs.vertices]
            ys = [v["y"] for v in obs.vertices]
            min_gx = max(0, int(min(xs) / cell_size) - 1)
            max_gx = min(gw - 1, int(max(xs) / cell_size) + 1)
            min_gy = max(0, int(min(ys) / cell_size) - 1)
            max_gy = min(gh - 1, int(max(ys) / cell_size) + 1)
            for gx in range(min_gx, max_gx + 1):
                for gy in range(min_gy, max_gy + 1):
                    if not grid.is_wall(gx, gy):
                        px = (gx + 0.5) * cell_size
                        py = (gy + 0.5) * cell_size
                        if obs.contains_point(px, py):
                            grid.set_wall(gx, gy)

        # For non-rectangle shapes, mark cells outside the shape as WALL
        # so they don't count as fillable territory.
        if self.level_shape != 'rectangle':
            for gx in range(gw):
                for gy in range(gh):
                    if not grid.is_wall(gx, gy):
                        px = (gx + 0.5) * cell_size
                        py = (gy + 0.5) * cell_size
                        if not self._is_point_inside_shape(px, py):
                            grid.set_wall(gx, gy)

        # Scale ball positions to grid space
        class _ScaledBall:
            __slots__ = ("x", "y")
            def __init__(self, x: float, y: float) -> None:
                self.x = x
                self.y = y

        scaled_balls = [
            _ScaledBall(b.x / cell_size, b.y / cell_size)
            for b in self.balls
        ]

        regions = find_enclosed_regions(grid, scaled_balls)

        # Compute fill percentage
        total_cells = gw * gh
        fillable = total_cells - grid.wall_count
        filled_count = sum(r.cell_count for r in regions if r.is_filled)

        self.fill_percentage = (
            (filled_count / fillable * 100) if fillable > 0 else 0.0
        )

        # Store filled regions for rendering (row-run encoded in pixel coords)
        self.filled_regions = []
        for r in regions:
            if r.is_filled and r.cell_count > 0:
                rows = defaultdict(list)
                for cx, cy in r.cells:
                    rows[cy].append(cx)

                for gy, gxs in sorted(rows.items()):
                    gxs.sort()
                    run_start = gxs[0]
                    run_end = gxs[0]
                    for gx in gxs[1:]:
                        if gx == run_end + 1:
                            run_end = gx
                        else:
                            self.filled_regions.append({
                                "x": run_start * cell_size,
                                "y": gy * cell_size,
                                "width": (run_end - run_start + 1) * cell_size,
                                "height": cell_size,
                                "cell_count": run_end - run_start + 1,
                            })
                            run_start = gx
                            run_end = gx
                    self.filled_regions.append({
                        "x": run_start * cell_size,
                        "y": gy * cell_size,
                        "width": (run_end - run_start + 1) * cell_size,
                        "height": cell_size,
                        "cell_count": run_end - run_start + 1,
                    })

        # Re-add obstacle regions (permanent filled territory)
        for obs in self.obstacles:
            xs = [v["x"] for v in obs.vertices]
            ys = [v["y"] for v in obs.vertices]
            self.filled_regions.append({
                "x": min(xs), "y": min(ys),
                "width": max(xs) - min(xs),
                "height": max(ys) - min(ys),
                "cell_count": 0,
                "obstacle": True,
                "points": obs.vertices,
            })

        # Win condition
        if self.fill_percentage >= WIN_FILL_PERCENT:
            self.state = "won"

        # Fix 2: Push any ball that ended up inside a filled region back out
        self._validate_balls_after_territory()

    def _clamp_ball_to_play_area(self, ball: Ball) -> None:
        """Clamp ball position so it stays within the play area shape."""
        if self._is_point_inside_shape(ball.x, ball.y):
            return  # Already inside

        # Find nearest point on any boundary segment
        best_dist_sq = float('inf')
        best_nx, best_ny = ball.x, ball.y

        for b in self.boundaries:
            nx, ny = self._nearest_point_on_segment(
                ball.x, ball.y, b["x1"], b["y1"], b["x2"], b["y2"]
            )
            d = (ball.x - nx) ** 2 + (ball.y - ny) ** 2
            if d < best_dist_sq:
                best_dist_sq = d
                best_nx, best_ny = nx, ny

        # Nudge ball inside the shape (toward centroid)
        verts = self._shape_vertices
        cx = sum(v[0] for v in verts) / len(verts)
        cy = sum(v[1] for v in verts) / len(verts)
        dx = cx - best_nx
        dy = cy - best_ny
        length = math.sqrt(dx * dx + dy * dy) or 1.0
        nudge = ball.radius + 1
        prev_x, prev_y = ball.x, ball.y
        ball.x = best_nx + (dx / length) * nudge
        ball.y = best_ny + (dy / length) * nudge

        # Reverse velocity to bounce away from the wall
        if ball.x != prev_x:
            ball.vx = -ball.vx
        if ball.y != prev_y:
            ball.vy = -ball.vy

    def _sanitize_balls(self) -> None:
        """Safety check: fix any ball with NaN/Infinity position or velocity."""
        # Compute a safe center point inside the shape
        verts = self._shape_vertices
        safe_x = sum(v[0] for v in verts) / len(verts)
        safe_y = sum(v[1] for v in verts) / len(verts)

        for ball in self.balls:
            fixed = False
            if not (math.isfinite(ball.x) and math.isfinite(ball.y)):
                logger.warning(
                    "Ball had invalid position (%.2f, %.2f), resetting to center",
                    ball.x, ball.y,
                )
                ball.x = safe_x
                ball.y = safe_y
                fixed = True
            if not (math.isfinite(ball.vx) and math.isfinite(ball.vy)):
                logger.warning(
                    "Ball had invalid velocity (%.2f, %.2f), resetting",
                    ball.vx, ball.vy,
                )
                angle = random.uniform(0, 2 * math.pi)
                ball.vx = BALL_SPEED * math.cos(angle)
                ball.vy = BALL_SPEED * math.sin(angle)
                fixed = True
            if fixed:
                self._clamp_ball_to_play_area(ball)

    def _validate_balls_after_territory(self) -> None:
        """Push any ball stuck in a filled region back to the active play area.

        Scans outward in small increments (radius * 0.5) in all 4 directions,
        picking the nearest valid (unfilled) position.
        """
        for ball in self.balls:
            inside_region = False
            for region in self.filled_regions:
                rx, ry = region["x"], region["y"]
                rw, rh = region["width"], region["height"]
                if (rx <= ball.x <= rx + rw and ry <= ball.y <= ry + rh):
                    inside_region = True
                    break

            if not inside_region:
                continue

            # Scan outward in small steps to find nearest unfilled position
            step = ball.radius * 0.5
            directions = [(1, 0), (-1, 0), (0, 1), (0, -1)]
            best_dist = float("inf")
            best_pos = None
            best_dir_idx = -1

            for dir_idx, (ddx, ddy) in enumerate(directions):
                for k in range(1, 20):  # scan up to 10 radii out
                    test_x = ball.x + ddx * step * k
                    test_y = ball.y + ddy * step * k

                    # Check if this position is outside all filled regions
                    in_filled = False
                    for region in self.filled_regions:
                        rx, ry = region["x"], region["y"]
                        rw, rh = region["width"], region["height"]
                        if (rx - ball.radius < test_x < rx + rw + ball.radius
                                and ry - ball.radius < test_y < ry + rh + ball.radius):
                            in_filled = True
                            break
                    if not in_filled:
                        dist = math.sqrt(
                            (test_x - ball.x) ** 2 + (test_y - ball.y) ** 2
                        )
                        if dist < best_dist:
                            best_dist = dist
                            best_pos = (test_x, test_y)
                            best_dir_idx = dir_idx
                        break  # found exit in this direction

            if best_pos is not None:
                ball.x, ball.y = best_pos
                ddx, ddy = directions[best_dir_idx]
                if ddx != 0:
                    ball.vx = abs(ball.vx) * ddx
                if ddy != 0:
                    ball.vy = abs(ball.vy) * ddy
            # After ejection, ensure ball is still within play area bounds
            self._clamp_ball_to_play_area(ball)
