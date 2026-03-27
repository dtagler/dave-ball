"""
Shared pytest fixtures for the Dave Ball arcade game test suite.

These fixtures provide pre-configured game objects for physics and territory tests.
All imports reference planned module paths — tests will fail with ImportError
until the backend modules are implemented. This is intentional (TDD approach).
"""

import pytest
from backend.game_state import GameState
from backend.physics import Ball


# ---------------------------------------------------------------------------
# Game state fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def game_state():
    """Return a fresh GameState with the default 800×600 play area."""
    return GameState(width=800, height=600)


# ---------------------------------------------------------------------------
# Ball fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def single_ball():
    """Return a single ball at center of 800×600 area with known velocity."""
    return Ball(x=400.0, y=300.0, vx=100.0, vy=80.0, radius=10.0)


@pytest.fixture
def two_balls():
    """Return two balls at different positions, moving in different directions."""
    ball_a = Ball(x=200.0, y=150.0, vx=120.0, vy=-90.0, radius=10.0)
    ball_b = Ball(x=600.0, y=450.0, vx=-80.0, vy=110.0, radius=10.0)
    return ball_a, ball_b


# ---------------------------------------------------------------------------
# Play-area / boundary fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def play_area():
    """Return play-area boundaries as four wall segments (left, top, right, bottom).

    Each wall is a dict with the two endpoints of the line segment:
        {"x1", "y1", "x2", "y2"}

    The coordinate system has (0, 0) at the top-left corner.
    """
    return {
        "left":   {"x1": 0,   "y1": 0,   "x2": 0,   "y2": 600},
        "top":    {"x1": 0,   "y1": 0,   "x2": 800, "y2": 0},
        "right":  {"x1": 800, "y1": 0,   "x2": 800, "y2": 600},
        "bottom": {"x1": 0,   "y1": 600, "x2": 800, "y2": 600},
    }
