"""Ball physics engine for the Dave Ball arcade game.

Handles ball movement, wall collision with elastic reflection,
and line-ball collision detection using point-to-segment distance.
"""

from __future__ import annotations

import math
import random
from typing import Dict, List, Optional

try:
    from .config import BALL_TUNNEL_CHANCE, PLAY_AREA_WIDTH, PLAY_AREA_HEIGHT
except ImportError:
    from config import BALL_TUNNEL_CHANCE, PLAY_AREA_WIDTH, PLAY_AREA_HEIGHT  # type: ignore[no-redef]

_MAX_SUB_STEPS = 4


class Ball:
    """A bouncing ball with position, velocity, and radius."""

    __slots__ = ("x", "y", "vx", "vy", "radius", "fission_cooldown")

    def __init__(
        self, x: float, y: float, vx: float, vy: float, radius: float = 8.0
    ) -> None:
        self.x = x
        self.y = y
        self.vx = vx
        self.vy = vy
        self.radius = radius
        self.fission_cooldown: float = 0.0

    def to_dict(self) -> Dict[str, float]:
        """JSON-serializable representation."""
        return {
            "x": self.x,
            "y": self.y,
            "vx": self.vx,
            "vy": self.vy,
            "radius": self.radius,
        }

    def update(self, dt: float) -> None:
        """Move ball by velocity × dt."""
        self.x += self.vx * dt
        self.y += self.vy * dt


# ---------------------------------------------------------------------------
# Position update (with sub-stepping to prevent tunneling)
# ---------------------------------------------------------------------------

def update_ball_position(
    ball: Ball, dt: float, boundaries: Optional[List[dict]] = None
) -> None:
    """Update ball position and optionally handle collisions.

    Uses sub-stepping when the ball would travel more than its radius
    in a single frame to prevent tunneling through walls.
    When *boundaries* is supplied (list of segment dicts), each segment is
    checked for collision after each sub-step.
    """
    # 0.1% chance per tick: ball phases through interior walls (chaos mechanic)
    if random.random() < BALL_TUNNEL_CHANCE:
        ball.update(dt)
        # Clamp to outer play area so the ball can't escape entirely
        r = ball.radius
        ball.x = max(r + 1, min(PLAY_AREA_WIDTH - r - 1, ball.x))
        ball.y = max(r + 1, min(PLAY_AREA_HEIGHT - r - 1, ball.y))
        return

    speed = math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy)
    travel = speed * dt

    # Determine sub-step count: split if travel > radius, cap at 4
    if travel > ball.radius and ball.radius > 0:
        num_steps = min(_MAX_SUB_STEPS, math.ceil(travel / ball.radius))
    else:
        num_steps = 1

    sub_dt = dt / num_steps

    for _ in range(num_steps):
        # Save pre-move position for swept collision detection
        old_x, old_y = ball.x, ball.y
        ball.update(sub_dt)

        if boundaries:
            # Check swept-circle collision against completed boundaries
            for boundary in boundaries:
                _check_swept_boundary_collision(ball, old_x, old_y, boundary)
            # Then resolve any remaining static penetration
            for boundary in boundaries:
                check_wall_collision(ball, boundary)


# ---------------------------------------------------------------------------
# Wall collision (axis-aligned play-area walls)
# ---------------------------------------------------------------------------

def check_wall_collision(ball: Ball, boundary: dict) -> bool:
    """Check and resolve ball collisions against boundary segments.

    *boundary* can be:
      - A dict of named wall segments (legacy format):
        ``{"left": {x1,y1,x2,y2}, "top": …, "right": …, "bottom": …}``
      - A single wall segment dict: ``{x1, y1, x2, y2}``

    Handles axis-aligned AND diagonal segments (for circle/octagon shapes).
    Resolves only the deepest penetrating collision first, then re-checks
    from the new position to handle corners without conflicting pushes.
    Velocity is elastically reflected (magnitude preserved).
    Returns ``True`` if any collision occurred.
    """
    # Normalise to a flat list of segment dicts
    if "x1" in boundary:
        walls: List[dict] = [boundary]
    else:
        walls = list(boundary.values())

    collided = False
    # Process up to 2 passes (deepest first, then re-check for corners)
    for _pass in range(2):
        best_depth = 0.0
        best_resolve = None

        for wall in walls:
            x1, y1 = wall["x1"], wall["y1"]
            x2, y2 = wall["x2"], wall["y2"]

            # Vertical wall (x1 == x2)
            if x1 == x2:
                lo_y = min(y1, y2) - ball.radius
                hi_y = max(y1, y2) + ball.radius
                if not (lo_y <= ball.y <= hi_y):
                    continue
                wall_x = x1
                if ball.x > wall_x and ball.x - ball.radius < wall_x:
                    depth = wall_x - (ball.x - ball.radius)
                    if depth > best_depth:
                        best_depth = depth
                        best_resolve = ("vx_pos", wall_x + ball.radius)
                elif ball.x < wall_x and ball.x + ball.radius > wall_x:
                    depth = (ball.x + ball.radius) - wall_x
                    if depth > best_depth:
                        best_depth = depth
                        best_resolve = ("vx_neg", wall_x - ball.radius)

            # Horizontal wall (y1 == y2)
            elif y1 == y2:
                lo_x = min(x1, x2) - ball.radius
                hi_x = max(x1, x2) + ball.radius
                if not (lo_x <= ball.x <= hi_x):
                    continue
                wall_y = y1
                if ball.y > wall_y and ball.y - ball.radius < wall_y:
                    depth = wall_y - (ball.y - ball.radius)
                    if depth > best_depth:
                        best_depth = depth
                        best_resolve = ("vy_pos", wall_y + ball.radius)
                elif ball.y < wall_y and ball.y + ball.radius > wall_y:
                    depth = (ball.y + ball.radius) - wall_y
                    if depth > best_depth:
                        best_depth = depth
                        best_resolve = ("vy_neg", wall_y - ball.radius)

            # Diagonal segment (general case)
            else:
                dx_seg = x2 - x1
                dy_seg = y2 - y1
                seg_len_sq = dx_seg * dx_seg + dy_seg * dy_seg
                if seg_len_sq == 0:
                    continue
                t = max(0.0, min(1.0, ((ball.x - x1) * dx_seg + (ball.y - y1) * dy_seg) / seg_len_sq))
                closest_x = x1 + t * dx_seg
                closest_y = y1 + t * dy_seg
                dist_x = ball.x - closest_x
                dist_y = ball.y - closest_y
                dist_sq = dist_x * dist_x + dist_y * dist_y
                if dist_sq < ball.radius * ball.radius and dist_sq > 0.001:
                    dist = math.sqrt(dist_sq)
                    depth = ball.radius - dist
                    if depth > best_depth:
                        best_depth = depth
                        nx = dist_x / dist
                        ny = dist_y / dist
                        best_resolve = ("general", closest_x, closest_y, nx, ny)

        if best_resolve is None:
            break  # no more collisions

        kind = best_resolve[0]
        if kind == "vx_pos":
            ball.vx = abs(ball.vx)
            ball.x = best_resolve[1]
        elif kind == "vx_neg":
            ball.vx = -abs(ball.vx)
            ball.x = best_resolve[1]
        elif kind == "vy_pos":
            ball.vy = abs(ball.vy)
            ball.y = best_resolve[1]
        elif kind == "vy_neg":
            ball.vy = -abs(ball.vy)
            ball.y = best_resolve[1]
        elif kind == "general":
            _, cx, cy, nx, ny = best_resolve
            ball.x = cx + nx * ball.radius
            ball.y = cy + ny * ball.radius
            # Reflect velocity: v' = v - 2(v·n)n
            dot = ball.vx * nx + ball.vy * ny
            ball.vx -= 2 * dot * nx
            ball.vy -= 2 * dot * ny
        collided = True

    return collided


# ---------------------------------------------------------------------------
# Swept-circle collision for completed boundaries (Fix #5)
# ---------------------------------------------------------------------------

def _check_swept_boundary_collision(
    ball: Ball, old_x: float, old_y: float, boundary: dict
) -> bool:
    """Check if ball's movement path crossed a boundary segment.

    Uses swept-circle vs segment: checks if the line from
    (old_x, old_y) to (ball.x, ball.y) passed through a wall, and if so
    snaps the ball back to the collision side and reflects velocity.
    Handles axis-aligned AND diagonal segments.
    """
    if "x1" in boundary:
        walls: List[dict] = [boundary]
    else:
        walls = list(boundary.values())

    hit = False
    for wall in walls:
        x1, y1 = wall["x1"], wall["y1"]
        x2, y2 = wall["x2"], wall["y2"]

        # Vertical wall
        if x1 == x2:
            wall_x = x1
            lo_y = min(y1, y2)
            hi_y = max(y1, y2)

            # Did the ball center cross this wall's x during the move?
            if old_x - ball.radius >= wall_x and ball.x - ball.radius < wall_x:
                # Ball moved left past the wall
                if lo_y - ball.radius <= ball.y <= hi_y + ball.radius:
                    ball.x = wall_x + ball.radius
                    ball.vx = abs(ball.vx)
                    hit = True
            elif old_x + ball.radius <= wall_x and ball.x + ball.radius > wall_x:
                # Ball moved right past the wall
                if lo_y - ball.radius <= ball.y <= hi_y + ball.radius:
                    ball.x = wall_x - ball.radius
                    ball.vx = -abs(ball.vx)
                    hit = True

        # Horizontal wall
        elif y1 == y2:
            wall_y = y1
            lo_x = min(x1, x2)
            hi_x = max(x1, x2)

            if old_y - ball.radius >= wall_y and ball.y - ball.radius < wall_y:
                # Ball moved up past the wall
                if lo_x - ball.radius <= ball.x <= hi_x + ball.radius:
                    ball.y = wall_y + ball.radius
                    ball.vy = abs(ball.vy)
                    hit = True
            elif old_y + ball.radius <= wall_y and ball.y + ball.radius > wall_y:
                # Ball moved down past the wall
                if lo_x - ball.radius <= ball.x <= hi_x + ball.radius:
                    ball.y = wall_y - ball.radius
                    ball.vy = -abs(ball.vy)
                    hit = True

        # Diagonal segment
        else:
            dx_seg = x2 - x1
            dy_seg = y2 - y1
            seg_len_sq = dx_seg * dx_seg + dy_seg * dy_seg
            if seg_len_sq == 0:
                continue
            # Check if ball crossed the segment during movement
            t = max(0.0, min(1.0, ((ball.x - x1) * dx_seg + (ball.y - y1) * dy_seg) / seg_len_sq))
            cx = x1 + t * dx_seg
            cy = y1 + t * dy_seg
            dist_x = ball.x - cx
            dist_y = ball.y - cy
            dist_sq = dist_x * dist_x + dist_y * dist_y
            if dist_sq < ball.radius * ball.radius and dist_sq > 0.001:
                dist = math.sqrt(dist_sq)
                nx = dist_x / dist
                ny = dist_y / dist
                ball.x = cx + nx * ball.radius
                ball.y = cy + ny * ball.radius
                dot = ball.vx * nx + ball.vy * ny
                ball.vx -= 2 * dot * nx
                ball.vy -= 2 * dot * ny
                hit = True

    return hit


# ---------------------------------------------------------------------------
# Line-ball collision (growing lines)
# ---------------------------------------------------------------------------

def _point_to_segment_dist_sq(
    px: float, py: float,
    x1: float, y1: float,
    x2: float, y2: float,
) -> float:
    """Squared distance from point (px, py) to segment (x1,y1)-(x2,y2)."""
    dx = x2 - x1
    dy = y2 - y1
    length_sq = dx * dx + dy * dy
    if length_sq == 0.0:
        return (px - x1) ** 2 + (py - y1) ** 2
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / length_sq))
    closest_x = x1 + t * dx
    closest_y = y1 + t * dy
    return (px - closest_x) ** 2 + (py - closest_y) ** 2


def check_line_ball_collision(line: dict, ball: Ball) -> bool:
    """Return True if *ball* intersects the line segment.

    Uses AABB pre-check followed by exact point-to-segment distance.
    """
    x1, y1 = line["x1"], line["y1"]
    x2, y2 = line["x2"], line["y2"]

    # AABB pre-check
    if ball.x < min(x1, x2) - ball.radius:
        return False
    if ball.x > max(x1, x2) + ball.radius:
        return False
    if ball.y < min(y1, y2) - ball.radius:
        return False
    if ball.y > max(y1, y2) + ball.radius:
        return False

    dist_sq = _point_to_segment_dist_sq(ball.x, ball.y, x1, y1, x2, y2)
    return dist_sq <= ball.radius * ball.radius


# ---------------------------------------------------------------------------
# Ball-ball collision
# ---------------------------------------------------------------------------

def resolve_ball_ball_collision(
    ball1: Ball, ball2: Ball, play_area: Optional[dict] = None
) -> None:
    """Elastic 2D collision response between two equal-mass balls.

    Projects velocities onto the collision normal, swaps the normal
    components (elastic), preserves tangent components, and pushes the
    balls apart so they no longer overlap.

    If *play_area* is provided, both balls are clamped and wall-checked
    after separation to prevent being pushed into a wall.
    """
    dx = ball2.x - ball1.x
    dy = ball2.y - ball1.y
    dist = math.sqrt(dx * dx + dy * dy)
    if dist < 1e-9:
        # Perfectly overlapping — nudge apart along a random direction
        angle = random.uniform(0, 2 * math.pi)
        dx = math.cos(angle)
        dy = math.sin(angle)
        dist = 1.0

    # Unit collision normal
    nx = dx / dist
    ny = dy / dist

    # Relative velocity of ball1 toward ball2
    dvx = ball1.vx - ball2.vx
    dvy = ball1.vy - ball2.vy
    dvn = dvx * nx + dvy * ny

    # Don't resolve if balls are separating
    if dvn <= 0:
        # Still push apart if overlapping
        overlap = (ball1.radius + ball2.radius) - dist
        if overlap > 0:
            half = overlap / 2.0 + 0.5
            # Cap separation per tick to prevent launching through walls
            max_sep = min(ball1.radius, ball2.radius) * 0.5
            half = min(half, max_sep)
            ball1.x -= nx * half
            ball1.y -= ny * half
            ball2.x += nx * half
            ball2.y += ny * half
        if play_area is not None:
            check_wall_collision(ball1, play_area)
            check_wall_collision(ball2, play_area)
        return

    # For equal-mass elastic collision, swap normal velocity components
    ball1.vx -= dvn * nx
    ball1.vy -= dvn * ny
    ball2.vx += dvn * nx
    ball2.vy += dvn * ny

    # Separate balls to prevent overlap
    overlap = (ball1.radius + ball2.radius) - dist
    if overlap > 0:
        half = overlap / 2.0 + 0.5
        # Cap separation per tick to prevent launching through walls
        max_sep = min(ball1.radius, ball2.radius) * 0.5
        half = min(half, max_sep)
        ball1.x -= nx * half
        ball1.y -= ny * half
        ball2.x += nx * half
        ball2.y += ny * half
    if play_area is not None:
        check_wall_collision(ball1, play_area)
        check_wall_collision(ball2, play_area)


def check_ball_ball_collision(
    ball1: Ball, ball2: Ball, play_area: Optional[dict] = None
) -> bool:
    """Check if two balls are colliding (distance <= sum of radii).

    If colliding, resolves the collision via elastic response and
    separates them.  When *play_area* is provided, both balls are
    clamped to the play area after separation.
    Returns True if a collision occurred.
    """
    dx = ball2.x - ball1.x
    dy = ball2.y - ball1.y
    dist_sq = dx * dx + dy * dy
    radii_sum = ball1.radius + ball2.radius
    if dist_sq > radii_sum * radii_sum:
        return False

    resolve_ball_ball_collision(ball1, ball2, play_area)
    return True
