"""Tests for the high-score system."""

import json
import os
import pytest
from backend.highscores import HighScoreManager


@pytest.fixture
def hs_file(tmp_path):
    """Return a temp file path for high-score JSON."""
    return str(tmp_path / "highscores.json")


@pytest.fixture
def manager(hs_file):
    """Return a HighScoreManager backed by a temp file."""
    return HighScoreManager(filepath=hs_file, max_entries=10)


# ------------------------------------------------------------------
# Basic operations
# ------------------------------------------------------------------

class TestHighScoreManager:
    def test_empty_leaderboard(self, manager):
        assert manager.get_scores() == []

    def test_add_single_score(self, manager):
        rank = manager.add_score("ABC", 1000, 3)
        assert rank == 1
        scores = manager.get_scores()
        assert len(scores) == 1
        assert scores[0] == {"initials": "ABC", "score": 1000, "level": 3}

    def test_scores_sorted_descending(self, manager):
        manager.add_score("AAA", 500, 1)
        manager.add_score("BBB", 1500, 2)
        manager.add_score("CCC", 1000, 3)
        scores = manager.get_scores()
        assert [s["score"] for s in scores] == [1500, 1000, 500]

    def test_max_10_entries(self, manager):
        for i in range(12):
            manager.add_score("TST", (i + 1) * 100, 1)
        assert len(manager.get_scores()) == 10
        # Lowest score (100) and second-lowest (200) should be gone
        assert all(s["score"] >= 300 for s in manager.get_scores())

    def test_rank_returned_correctly(self, manager):
        manager.add_score("AAA", 1000, 1)
        manager.add_score("BBB", 3000, 2)
        rank = manager.add_score("CCC", 2000, 3)
        assert rank == 2  # middle score

    def test_does_not_qualify(self, manager):
        for i in range(10):
            manager.add_score("TST", (i + 1) * 1000, 1)
        rank = manager.add_score("LOW", 50, 1)
        assert rank == -1
        assert len(manager.get_scores()) == 10


# ------------------------------------------------------------------
# Initials validation
# ------------------------------------------------------------------

class TestInitialsValidation:
    def test_lowercase_normalised(self, manager):
        rank = manager.add_score("abc", 1000, 1)
        assert rank == 1
        assert manager.get_scores()[0]["initials"] == "ABC"

    def test_too_short_rejected(self, manager):
        assert manager.add_score("AB", 1000, 1) == -1

    def test_too_long_rejected(self, manager):
        assert manager.add_score("ABCD", 1000, 1) == -1

    def test_numbers_rejected(self, manager):
        assert manager.add_score("A1B", 1000, 1) == -1

    def test_spaces_rejected(self, manager):
        assert manager.add_score("A B", 1000, 1) == -1

    def test_empty_rejected(self, manager):
        assert manager.add_score("", 1000, 1) == -1

    def test_whitespace_trimmed(self, manager):
        rank = manager.add_score("  abc  ", 1000, 1)
        assert rank == 1
        assert manager.get_scores()[0]["initials"] == "ABC"


# ------------------------------------------------------------------
# Persistence
# ------------------------------------------------------------------

class TestPersistence:
    def test_save_and_reload(self, hs_file):
        m1 = HighScoreManager(filepath=hs_file, max_entries=10)
        m1.add_score("AAA", 5000, 5)
        m1.add_score("BBB", 3000, 3)

        m2 = HighScoreManager(filepath=hs_file, max_entries=10)
        assert len(m2.get_scores()) == 2
        assert m2.get_scores()[0]["initials"] == "AAA"

    def test_corrupt_file_handled(self, hs_file):
        with open(hs_file, "w") as f:
            f.write("NOT JSON {{{")
        m = HighScoreManager(filepath=hs_file, max_entries=10)
        assert m.get_scores() == []

    def test_missing_file_handled(self, hs_file):
        m = HighScoreManager(filepath=hs_file, max_entries=10)
        assert m.get_scores() == []

    def test_creates_data_directory(self, tmp_path):
        deep = str(tmp_path / "a" / "b" / "scores.json")
        m = HighScoreManager(filepath=deep, max_entries=10)
        m.add_score("AAA", 1000, 1)
        assert os.path.exists(deep)


# ------------------------------------------------------------------
# is_high_score
# ------------------------------------------------------------------

class TestIsHighScore:
    def test_empty_board_always_qualifies(self, manager):
        assert manager.is_high_score(1) is True

    def test_full_board_higher_qualifies(self, manager):
        for i in range(10):
            manager.add_score("TST", (i + 1) * 100, 1)
        assert manager.is_high_score(9999) is True

    def test_full_board_lower_rejected(self, manager):
        for i in range(10):
            manager.add_score("TST", (i + 1) * 100, 1)
        assert manager.is_high_score(50) is False

    def test_equal_to_lowest_rejected(self, manager):
        for i in range(10):
            manager.add_score("TST", (i + 1) * 100, 1)
        assert manager.is_high_score(100) is False
