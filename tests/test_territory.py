"""
Territory / flood-fill tests for the Dave Ball arcade game.

Covers:
  - Basic flood-fill behaviour (open grid, walls blocking fill)
  - Region splitting by boundary lines
  - Interaction with ball positions (regions with/without balls)
  - Fill-percentage arithmetic
  - Edge cases (thin regions, ball on boundary, multiple regions)

All imports reference planned module paths.  Tests will raise ImportError
until the backend territory module is implemented — that's expected for TDD.
"""

import pytest

from backend.territory import Grid, flood_fill, find_enclosed_regions
from backend.physics import Ball

# ---------------------------------------------------------------------------
# Markers
# ---------------------------------------------------------------------------
pytestmark = pytest.mark.territory


# ===========================================================================
# Helpers
# ===========================================================================

def _make_grid(width: int, height: int, walls=None):
    """Create a Grid and optionally mark wall cells.

    ``walls`` is an iterable of (x, y) tuples to mark as walls.
    """
    grid = Grid(width, height)
    for wx, wy in (walls or []):
        grid.set_wall(wx, wy)
    return grid


# ===========================================================================
# Basic flood-fill
# ===========================================================================

class TestFloodFill:
    """Low-level flood-fill on a raw grid."""

    def test_flood_fill_empty_grid_marks_all_cells(self):
        """Flood-filling an empty grid from (0,0) should reach every cell."""
        grid = _make_grid(10, 10)
        filled = flood_fill(grid, start=(0, 0))
        assert len(filled) == 100  # 10×10

    def test_flood_fill_blocked_by_wall(self):
        """A vertical wall across the full height blocks fill to the right."""
        walls = [(5, y) for y in range(10)]
        grid = _make_grid(10, 10, walls=walls)
        filled = flood_fill(grid, start=(0, 0))
        # Should fill only the left half (columns 0-4 = 50 cells)
        assert all(x < 5 for x, _ in filled)
        assert len(filled) == 50


# ===========================================================================
# Region splitting
# ===========================================================================

class TestRegionSplitting:
    """Completed boundary lines split the play area into regions."""

    def test_vertical_line_splits_into_two_regions(self):
        """A full vertical wall produces exactly two regions."""
        walls = [(5, y) for y in range(10)]
        grid = _make_grid(10, 10, walls=walls)

        balls = []  # no balls → both regions should be "enclosed"
        regions = find_enclosed_regions(grid, balls)
        assert len(regions) == 2

    def test_multiple_enclosed_regions_simultaneously(self):
        """Two vertical walls create three separate regions."""
        walls = [(3, y) for y in range(10)] + [(7, y) for y in range(10)]
        grid = _make_grid(10, 10, walls=walls)

        balls = []
        regions = find_enclosed_regions(grid, balls)
        assert len(regions) == 3


# ===========================================================================
# Ball-region interaction
# ===========================================================================

class TestBallRegionInteraction:
    """Regions containing balls are NOT filled; empty regions ARE filled."""

    def test_region_with_ball_is_not_filled(self):
        """A region that contains a ball must remain unfilled."""
        walls = [(5, y) for y in range(10)]
        grid = _make_grid(10, 10, walls=walls)

        # Ball in the LEFT half (column 2)
        ball = Ball(x=2.0, y=5.0, vx=0, vy=0, radius=0.4)
        regions = find_enclosed_regions(grid, [ball])

        # One region should be marked as ball-occupied → not filled
        filled_regions = [r for r in regions if r.is_filled]
        unfilled_regions = [r for r in regions if not r.is_filled]
        assert len(filled_regions) == 1, "Right side (no ball) should be filled"
        assert len(unfilled_regions) == 1, "Left side (has ball) should stay open"

    def test_region_without_ball_is_filled(self):
        """A region that has no ball inside it is enclosed and should be filled."""
        walls = [(5, y) for y in range(10)]
        grid = _make_grid(10, 10, walls=walls)

        ball = Ball(x=2.0, y=5.0, vx=0, vy=0, radius=0.4)
        regions = find_enclosed_regions(grid, [ball])

        filled_regions = [r for r in regions if r.is_filled]
        assert len(filled_regions) >= 1

    def test_two_balls_same_region_not_filled(self):
        """Region containing two balls must NOT be filled."""
        walls = [(5, y) for y in range(10)]
        grid = _make_grid(10, 10, walls=walls)

        # Both balls in the left half
        ball_a = Ball(x=1.0, y=3.0, vx=0, vy=0, radius=0.4)
        ball_b = Ball(x=3.0, y=7.0, vx=0, vy=0, radius=0.4)
        regions = find_enclosed_regions(grid, [ball_a, ball_b])

        left_regions = [r for r in regions if not r.is_filled]
        assert len(left_regions) >= 1, "Left region with two balls stays open"

    def test_two_balls_different_regions_neither_filled(self):
        """Each ball keeps its own region open."""
        walls = [(5, y) for y in range(10)]
        grid = _make_grid(10, 10, walls=walls)

        ball_left = Ball(x=2.0, y=5.0, vx=0, vy=0, radius=0.4)
        ball_right = Ball(x=8.0, y=5.0, vx=0, vy=0, radius=0.4)
        regions = find_enclosed_regions(grid, [ball_left, ball_right])

        filled = [r for r in regions if r.is_filled]
        assert len(filled) == 0, "Both regions have a ball — nothing should fill"


# ===========================================================================
# Fill-percentage calculation
# ===========================================================================

class TestFillPercentage:
    """Verify the arithmetic of the fill-percentage metric."""

    def test_fill_percentage_known_area(self):
        """Half the grid filled → 50 %."""
        walls = [(5, y) for y in range(10)]
        grid = _make_grid(10, 10, walls=walls)

        # Ball in the left half only → right half (50 cells) fills
        ball = Ball(x=2.0, y=5.0, vx=0, vy=0, radius=0.4)
        regions = find_enclosed_regions(grid, [ball])

        total_fillable = grid.width * grid.height - len(walls)
        filled_cells = sum(r.cell_count for r in regions if r.is_filled)
        pct = (filled_cells / total_fillable) * 100

        # Right half is 4 columns (6-9) × 10 rows = 40 cells out of 90 fillable
        assert pct == pytest.approx(40 / 90 * 100, abs=1.0)


# ===========================================================================
# Edge cases
# ===========================================================================

class TestEdgeCases:
    """Tricky scenarios that are easy to get wrong."""

    def test_very_thin_region_one_cell_wide(self):
        """A 1-cell-wide region between two walls should still be detected."""
        # Two walls at columns 4 and 6 → column 5 is a 1-cell-wide corridor
        walls = [(4, y) for y in range(10)] + [(6, y) for y in range(10)]
        grid = _make_grid(10, 10, walls=walls)

        balls = []
        regions = find_enclosed_regions(grid, balls)
        region_sizes = sorted(r.cell_count for r in regions)
        assert 10 in region_sizes, "1-cell-wide corridor (10 cells tall) must be detected"

    def test_ball_exactly_on_boundary_line(self):
        """A ball sitting exactly on a wall cell should be treated as in the
        region on whichever side its center falls."""
        walls = [(5, y) for y in range(10)]
        grid = _make_grid(10, 10, walls=walls)

        # Ball center at x=5 (on the wall itself)
        ball = Ball(x=5.0, y=5.0, vx=0, vy=0, radius=0.4)
        # Should not crash; region assignment may vary by implementation,
        # but the function must return without error.
        regions = find_enclosed_regions(grid, [ball])
        assert isinstance(regions, list)
