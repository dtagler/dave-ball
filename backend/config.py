"""Game constants and server configuration."""

import os

# --- Server ---
BACKEND_HOST: str = "0.0.0.0"
BACKEND_PORT: int = 5000
CORS_ORIGINS: str = os.environ.get("CORS_ORIGINS", "*")  # Override in production via env var

# --- Play Area ---
PLAY_AREA_WIDTH: int = 800
PLAY_AREA_HEIGHT: int = 600

# --- Ball Physics (Phase 2) ---
BALL_RADIUS: int = 8
BALL_SPEED: float = 150.0        # base pixels per second (multiplied by speed_multiplier)
MAX_BALLS: int = 12
SPEED_MULTIPLIER_OPTIONS: dict = {"slow": 0.5, "normal": 1.0, "fast": 1.5}
BALL_TUNNEL_CHANCE: float = 0.001  # 0.1% chance per tick to phase through interior walls

# --- Fission ---
FISSION_COOLDOWN: float = 1.0           # seconds between fissions per ball
FISSION_DENSITY_RADIUS: float = 50.0    # radius to check for nearby balls before fission
FISSION_DENSITY_MAX: int = 4            # max nearby balls before fission is suppressed

# --- Line Growth (Phase 4) ---
LINE_GROWTH_SPEED: float = 250.0  # pixels per second
MAX_GROWING_LINES: int = 1        # only one line at a time

# --- Game Rules ---
INITIAL_LIVES: int = 5
WIN_FILL_PERCENT: float = 70.0
TICK_RATE: int = 30               # server updates per second

# --- Scoring ---
LEVEL_TIME_LIMIT: int = 100           # seconds per level
TIME_BONUS_BASE: int = 1000
TIME_BONUS_DECAY: float = 0.03
LIFE_BONUS_POINTS: int = 200
EFFICIENCY_BONUS_BASE: int = 500
EFFICIENCY_BONUS_PENALTY: int = 100

# --- Grid (Phase 5) ---
GRID_CELL_SIZE: int = 4           # pixels per grid cell

# --- Power-ups ---
POWERUP_SPAWN_CHANCE: float = 0.5
POWERUP_MAX_ON_FIELD: int = 5
CLOCK_SLOW_DURATION: float = 10.0
CLOCK_SLOW_FACTOR: float = 0.5
LIGHTNING_SPEED_MULTIPLIER: float = 5.0
POWERUP_WEIGHTS: dict = {
    "heart": 15,
    "clock": 15,
    "shield": 15,
    "lightning": 15,
    "freeze": 15,
    "shrink": 15,
    "bomb": 5,
    "mystery": 5,
    "skull": 10,
    "grow": 10,
    "fusion": 15,
    "fission_pu": 10,
    "wave": 12,
    "web": 12,
    "portal": 10,
    "sinkhole": 8,
    "snake": 15,
    "nuke": 15,
    "magnet": 12,
    "candy": 8,
    "fire": 12,
    "acid": 12,
    "anchor": 3,
}

# --- Nuke (Atomic Bomb) ---
NUKE_BLAST_RADIUS: int = 450

# --- Jackpot (rare instant-win) ---
JACKPOT_SPAWN_CHANCE: float = 0.01  # 1% chance per level

# --- Sinkhole ---
SINKHOLE_DURATION: float = 10.0
SINKHOLE_RADIUS: float = 30.0
SINKHOLE_PULL_RADIUS: float = 80.0
SINKHOLE_PULL_FORCE: float = 50.0

# --- Magnet ---
MAGNET_DURATION: float = 10.0
MAGNET_PULL_FORCE: float = 200.0

# --- Freeze / Shrink / Grow ---
FREEZE_DURATION: float = 5.0
SHRINK_DURATION: float = 10.0
SHRINK_FACTOR: float = 0.5
GROW_DURATION: float = 10.0
GROW_FACTOR: float = 3.0

# --- Fusion ---
FUSION_DURATION: float = 10.0
FUSION_MAX_RADIUS: float = 30.0

# --- Fission Power-Up ---
FISSION_PU_DURATION: float = 10.0

# --- Wave ---
WAVE_DURATION: float = 10.0
WAVE_AMPLITUDE: float = 50.0
WAVE_FREQUENCY: float = 8.0

# --- Portal ---
PORTAL_DURATION: float = 10.0
PORTAL_RADIUS: float = 25.0
PORTAL_COOLDOWN: float = 0.5
PORTAL_ANGLE_OFFSET: float = 15.0

# --- Web ---
WEB_DURATION: float = 15.0
WEB_SLOW_FACTOR: float = 0.25
WEB_LINGER_DURATION: float = 2.0
WEB_ZONE_RADIUS: float = 40.0
WEB_ZONE_COUNT_MIN: int = 2
WEB_ZONE_COUNT_MAX: int = 3

# --- Snake ---
SNAKE_DURATION: float = 10.0
SNAKE_SPEED: float = 180.0
SNAKE_EAT_RADIUS: float = 22.0
SNAKE_SEGMENT_SPACING: int = 14
SNAKE_SEGMENT_COUNT: int = 12
SNAKE_SEGMENT_RADIUS: float = 7.0

# --- Fruits ---
FRUIT_POINTS: dict = {
    "cherry": 100,
    "orange": 200,
    "apple": 300,
    "grape": 500,
    "strawberry": 1000,
}
FRUIT_WEIGHTS: dict = {
    "cherry": 30,
    "orange": 25,
    "apple": 20,
    "grape": 15,
    "strawberry": 10,
}
FRUIT_SPAWN_CHANCE: float = 0.4
FRUIT_MAX_ON_FIELD: int = 2

# --- Level Shapes ---
LEVEL_SHAPES: list = ['rectangle']

# --- Obstacles ---
OBSTACLE_SIZE: int = 150           # approximate diameter in pixels
OBSTACLE_MARGIN: int = 160         # min distance from play area edges
OBSTACLE_MIN_SPACING: int = 250    # min distance between obstacle centers
OBSTACLE_SHAPES: list = ['circle', 'square', 'triangle', 'diamond', 'star', 'octagon']

# --- Acid ---
ACID_DURATION: float = 12.0        # how long acid pools last
ACID_POOL_RADIUS: float = 35.0     # radius of each pool
ACID_POOL_COUNT_MIN: int = 3       # min pools spawned
ACID_POOL_COUNT_MAX: int = 5       # max pools spawned

# --- High Scores ---
MAX_HIGH_SCORES: int = 10
HIGH_SCORE_FILE: str = "data/highscores.json"
