"""Territory calculation and flood-fill for the Dave Ball arcade game.

Provides a Grid overlay for the play area, BFS-based flood fill,
and region detection to determine which areas are enclosed (no ball)
and should be filled.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Dict, List, Set, Tuple

# ---------------------------------------------------------------------------
# Cell-state constants
# ---------------------------------------------------------------------------
EMPTY = 0
WALL = 1
FILLED = 2


# ---------------------------------------------------------------------------
# Grid
# ---------------------------------------------------------------------------

class Grid:
    """2D cell grid overlay for the play area."""

    def __init__(self, width: int, height: int) -> None:
        self.width = width
        self.height = height
        self._cells: list[list[int]] = [
            [EMPTY] * height for _ in range(width)
        ]
        self._wall_count = 0

    # -- cell access --------------------------------------------------------

    def in_bounds(self, x: int, y: int) -> bool:
        return 0 <= x < self.width and 0 <= y < self.height

    def get_cell(self, x: int, y: int) -> int:
        if not self.in_bounds(x, y):
            return WALL
        return self._cells[x][y]

    def set_cell(self, x: int, y: int, value: int) -> None:
        if not self.in_bounds(x, y):
            return
        old = self._cells[x][y]
        self._cells[x][y] = value
        if old != WALL and value == WALL:
            self._wall_count += 1
        elif old == WALL and value != WALL:
            self._wall_count -= 1

    def set_wall(self, x: int, y: int) -> None:
        self.set_cell(x, y, WALL)

    def is_wall(self, x: int, y: int) -> bool:
        return self.get_cell(x, y) == WALL

    @property
    def wall_count(self) -> int:
        return self._wall_count

    # -- rasterisation ------------------------------------------------------

    def rasterize_boundaries(self, boundaries: List[Dict[str, float]]) -> None:
        """Mark grid cells as WALL along each boundary line segment.

        Coordinates are clamped to grid bounds so that play-area edge
        boundaries (e.g. x=width) are properly rasterized.
        """
        for b in boundaries:
            x1 = max(0, min(int(b["x1"]), self.width - 1))
            y1 = max(0, min(int(b["y1"]), self.height - 1))
            x2 = max(0, min(int(b["x2"]), self.width - 1))
            y2 = max(0, min(int(b["y2"]), self.height - 1))
            self._rasterize_line(x1, y1, x2, y2)

    def _rasterize_line(self, x1: int, y1: int, x2: int, y2: int) -> None:
        """Bresenham's line algorithm to rasterize a segment onto the grid."""
        dx = abs(x2 - x1)
        dy = abs(y2 - y1)
        sx = 1 if x1 < x2 else -1
        sy = 1 if y1 < y2 else -1
        err = dx - dy

        while True:
            self.set_wall(x1, y1)
            if x1 == x2 and y1 == y2:
                break
            e2 = 2 * err
            if e2 > -dy:
                err -= dy
                x1 += sx
            if e2 < dx:
                err += dx
                y1 += sy


# ---------------------------------------------------------------------------
# Region
# ---------------------------------------------------------------------------

@dataclass
class Region:
    """A contiguous region of non-wall cells."""

    cells: Set[Tuple[int, int]]
    is_filled: bool

    @property
    def cell_count(self) -> int:
        return len(self.cells)


# ---------------------------------------------------------------------------
# Flood fill
# ---------------------------------------------------------------------------

def flood_fill(
    grid: Grid,
    start: Tuple[int, int],
) -> Set[Tuple[int, int]]:
    """BFS flood fill from *start*.

    Returns the set of all non-wall cells reachable from *start*.
    Stops at WALL cells and grid boundaries.
    """
    sx, sy = start
    if not grid.in_bounds(sx, sy) or grid.is_wall(sx, sy):
        return set()

    visited: Set[Tuple[int, int]] = set()
    queue: deque[Tuple[int, int]] = deque()
    queue.append((sx, sy))
    visited.add((sx, sy))

    while queue:
        cx, cy = queue.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = cx + dx, cy + dy
            if (
                (nx, ny) not in visited
                and grid.in_bounds(nx, ny)
                and not grid.is_wall(nx, ny)
            ):
                visited.add((nx, ny))
                queue.append((nx, ny))

    return visited


# ---------------------------------------------------------------------------
# Enclosed-region detection
# ---------------------------------------------------------------------------

def find_enclosed_regions(
    grid: Grid,
    balls: list,
) -> List[Region]:
    """Discover all contiguous non-wall regions in *grid*.

    Regions that contain no ball are marked ``is_filled=True``;
    regions with at least one ball remain open (``is_filled=False``).
    """
    visited: Set[Tuple[int, int]] = set()
    raw_regions: List[Set[Tuple[int, int]]] = []

    for x in range(grid.width):
        for y in range(grid.height):
            if (x, y) not in visited and not grid.is_wall(x, y):
                region_cells = flood_fill(grid, start=(x, y))
                visited.update(region_cells)
                if region_cells:
                    raw_regions.append(region_cells)

    result: List[Region] = []
    for region_cells in raw_regions:
        has_ball = _region_contains_ball(grid, region_cells, balls)
        result.append(Region(cells=region_cells, is_filled=not has_ball))

    return result


def _region_contains_ball(
    grid: Grid,
    region_cells: Set[Tuple[int, int]],
    balls: list,
) -> bool:
    """Return True if any ball's grid position falls within *region_cells*."""
    for ball in balls:
        bx, by = int(ball.x), int(ball.y)
        if (bx, by) in region_cells:
            return True
        # Ball centre may sit exactly on a wall cell; check neighbours.
        if grid.is_wall(bx, by):
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if (bx + dx, by + dy) in region_cells:
                    return True
    return False
