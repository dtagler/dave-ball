"""High score persistence for the Dave Ball arcade game."""

import json
import os
import re

_INITIALS_RE = re.compile(r"^[A-Z]{3}$")

_DEFAULT_MAX = 10
_DEFAULT_FILE = os.path.join(os.path.dirname(__file__), "data", "highscores.json")


class HighScoreManager:
    """Manage a top-N leaderboard backed by a JSON file."""

    def __init__(self, filepath: str | None = None, max_entries: int | None = None):
        self._filepath = filepath or _DEFAULT_FILE
        self._max = max_entries or _DEFAULT_MAX
        self._scores: list[dict] = []
        self.load()

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def load(self) -> None:
        """Read scores from disk; start empty if missing or corrupt."""
        try:
            with open(self._filepath, "r", encoding="utf-8") as fh:
                data = json.load(fh)
                if isinstance(data, list):
                    self._scores = data[: self._max]
                else:
                    self._scores = []
        except (FileNotFoundError, json.JSONDecodeError):
            self._scores = []

    def save(self) -> None:
        """Write the current leaderboard to disk."""
        os.makedirs(os.path.dirname(self._filepath), exist_ok=True)
        with open(self._filepath, "w", encoding="utf-8") as fh:
            json.dump(self._scores, fh, indent=2)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_scores(self) -> list[dict]:
        """Return the leaderboard sorted by score descending."""
        return list(self._scores)

    def is_high_score(self, score: int) -> bool:
        """Return True if *score* would qualify for the leaderboard."""
        if len(self._scores) < self._max:
            return True
        return score > self._scores[-1]["score"]

    def add_score(self, initials: str, score: int, level: int) -> int:
        """Add a score if it qualifies. Return 1-based rank, or -1."""
        initials = self._sanitize_initials(initials)
        if initials is None:
            return -1

        if not self.is_high_score(score):
            return -1

        entry = {"initials": initials, "score": int(score), "level": int(level)}
        self._scores.append(entry)
        self._scores.sort(key=lambda e: e["score"], reverse=True)
        self._scores = self._scores[: self._max]

        try:
            rank = next(
                i + 1
                for i, e in enumerate(self._scores)
                if e is entry
            )
        except StopIteration:
            return -1

        self.save()
        return rank

    # ------------------------------------------------------------------
    # Validation helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _sanitize_initials(raw: str) -> str | None:
        """Validate and normalise initials to 3 uppercase letters."""
        if not isinstance(raw, str):
            return None
        cleaned = raw.strip().upper()
        if _INITIALS_RE.match(cleaned):
            return cleaned
        return None
