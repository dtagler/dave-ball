"""Smoke tests – verify the game loads and basic UI elements work."""

import re

import pytest
from playwright.sync_api import Page, expect

from conftest import wait_for_socket, start_game, expect_overlay_shown, expect_overlay_hidden


def test_page_loads_and_canvas_visible(page: Page):
    """Canvas element is rendered and has correct dimensions."""
    page.goto("/")
    canvas = page.locator("#game-canvas")
    expect(canvas).to_be_visible()

    box = canvas.bounding_box()
    assert box is not None
    assert box["width"] == 800
    assert box["height"] == 650


def test_start_overlay_shown_initially(page: Page):
    """Start screen overlay is visible with title on first load."""
    page.goto("/")
    expect_overlay_shown(page, "overlay-start")

    title = page.locator(".game-title")
    expect(title).to_have_text("DAVE BALL")

    subtitle = page.locator(".game-subtitle")
    expect(subtitle).to_contain_text("territory")


def test_speed_selector_buttons_exist(page: Page):
    """Three speed selector buttons (Slow, Normal, Fast) are present."""
    page.goto("/")
    speed_buttons = page.locator(".speed-btn")
    expect(speed_buttons).to_have_count(3)

    expect(speed_buttons.nth(0)).to_have_text("Slow")
    expect(speed_buttons.nth(1)).to_have_text("Normal")
    expect(speed_buttons.nth(2)).to_have_text("Fast")


def test_speed_selector_can_be_clicked(page: Page):
    """Clicking a speed button updates the selected state."""
    page.goto("/")
    slow_btn = page.locator('.speed-btn[data-speed="slow"]')
    normal_btn = page.locator('.speed-btn[data-speed="normal"]')

    # Normal is selected by default
    expect(normal_btn).to_have_class(re.compile(r"selected"))

    # Click Slow — it becomes selected, Normal loses selection
    slow_btn.click()
    expect(slow_btn).to_have_class(re.compile(r"selected"))
    expect(normal_btn).not_to_have_class(re.compile(r"selected"))

    # Click Fast
    fast_btn = page.locator('.speed-btn[data-speed="fast"]')
    fast_btn.click()
    expect(fast_btn).to_have_class(re.compile(r"selected"))
    expect(slow_btn).not_to_have_class(re.compile(r"selected"))


def test_mute_button_toggles(page: Page):
    """Mute button toggles between speaker-on and speaker-off icons."""
    page.goto("/")
    mute_btn = page.locator("#btn-mute")
    expect(mute_btn).to_be_visible()

    # Default state is unmuted (speaker icon)
    expect(mute_btn).to_have_text("🔊")

    # Click to mute
    mute_btn.click()
    expect(mute_btn).to_have_text("🔇")

    # Click again to unmute
    mute_btn.click()
    expect(mute_btn).to_have_text("🔊")


def test_clicking_play_starts_game(page: Page):
    """Clicking the Play button hides the start overlay."""
    page.goto("/")
    expect_overlay_shown(page, "overlay-start")

    wait_for_socket(page)
    page.locator("#btn-start").click()

    # The overlay loses its 'active' class
    expect_overlay_hidden(page, "overlay-start")

    # Canvas should still be visible
    expect(page.locator("#game-canvas")).to_be_visible()


@pytest.mark.slow
def test_esc_shows_pause_overlay(page: Page):
    """Pressing ESC during gameplay shows the pause overlay."""
    start_game(page)

    # Small wait for game loop to initialize
    page.wait_for_timeout(500)

    # Press ESC to pause
    page.keyboard.press("Escape")

    expect_overlay_shown(page, "overlay-pause", timeout=3000)
    expect(page.locator("#overlay-pause")).to_contain_text("PAUSED")

    # Press ESC again to resume
    page.keyboard.press("Escape")
    expect_overlay_hidden(page, "overlay-pause", timeout=3000)


def test_help_screen_can_be_opened_and_closed(page: Page):
    """Help overlay opens via button and closes via Back button."""
    page.goto("/")

    # Wait for start overlay to be active before interacting
    expect_overlay_shown(page, "overlay-start")

    # Help is not active initially
    expect_overlay_hidden(page, "overlay-help")

    # Click the help button
    page.locator("#btn-help").click()
    expect_overlay_shown(page, "overlay-help", timeout=3000)

    # Verify content is present
    help_overlay = page.locator("#overlay-help")
    expect(help_overlay).to_contain_text("HOW TO PLAY")
    expect(help_overlay).to_contain_text("CONTROLS")
    expect(help_overlay).to_contain_text("POWER-UPS")

    # Click Back to close
    page.locator("#btn-help-back").click()
    expect_overlay_hidden(page, "overlay-help", timeout=3000)

    # Start overlay should be active again
    expect_overlay_shown(page, "overlay-start")


def test_theme_selector_buttons_exist(page: Page):
    """Theme selector buttons are present and clickable."""
    page.goto("/")
    theme_buttons = page.locator(".theme-btn")
    expect(theme_buttons).to_have_count(5)

    # Default theme is selected
    default_btn = page.locator('.theme-btn[data-theme="default"]')
    expect(default_btn).to_have_class(re.compile(r"selected"))

    # Click Neon theme
    neon_btn = page.locator('.theme-btn[data-theme="neon"]')
    neon_btn.click()
    expect(neon_btn).to_have_class(re.compile(r"selected"))
    expect(default_btn).not_to_have_class(re.compile(r"selected"))


def test_game_over_overlay_has_retry_button(page: Page):
    """Game over overlay contains a retry button (verify DOM structure)."""
    page.goto("/")
    gameover_overlay = page.locator("#overlay-gameover")
    retry_btn = page.locator("#btn-retry")
    menu_btn = page.locator("#btn-gameover-menu")

    # Overlay and buttons exist in the DOM
    assert gameover_overlay.count() == 1
    assert retry_btn.count() == 1
    assert menu_btn.count() == 1


def test_win_overlay_has_next_button(page: Page):
    """Win overlay contains a Next Level button (verify DOM structure)."""
    page.goto("/")
    win_overlay = page.locator("#overlay-win")
    next_btn = page.locator("#btn-next")

    # Overlay and button exist in the DOM
    assert win_overlay.count() == 1
    assert next_btn.count() == 1


# ---------------------------------------------------------------------------
# New UI / structure tests
# ---------------------------------------------------------------------------


def test_highscore_entry_overlay_structure(page: Page):
    """High score entry overlay has 3 initial inputs and a submit button."""
    page.goto("/")
    overlay = page.locator("#overlay-highscore-entry")
    assert overlay.count() == 1

    # Three single-character initial inputs
    inputs = page.locator(".hs-initial-input")
    expect(inputs).to_have_count(3)
    for i in range(3):
        assert page.locator(f"#hs-init-{i}").count() == 1

    # Submit button exists and starts disabled
    submit_btn = page.locator("#btn-submit-score")
    assert submit_btn.count() == 1
    expect(submit_btn).to_be_disabled()


def test_leaderboard_overlay_structure(page: Page):
    """Leaderboard overlay has a table with rank/name/score/lvl headers."""
    page.goto("/")
    overlay = page.locator("#overlay-leaderboard")
    assert overlay.count() == 1

    # Table headers
    table = page.locator(".leaderboard-table")
    assert table.count() == 1
    expect(table).to_contain_text("RANK")
    expect(table).to_contain_text("NAME")
    expect(table).to_contain_text("SCORE")
    expect(table).to_contain_text("LVL")

    # Navigation buttons
    assert page.locator("#btn-leaderboard-play").count() == 1
    assert page.locator("#btn-leaderboard-menu").count() == 1


def test_win_overlay_contains_score_display(page: Page):
    """Win overlay has a score display element."""
    page.goto("/")
    win_score = page.locator("#win-score")
    assert win_score.count() == 1
    expect(page.locator("#overlay-win")).to_contain_text("LEVEL COMPLETE!")


def test_gameover_overlay_contains_score_display(page: Page):
    """Game over overlay has a score display and buttons."""
    page.goto("/")
    go_score = page.locator("#gameover-score")
    assert go_score.count() == 1
    expect(page.locator("#overlay-gameover")).to_contain_text("GAME OVER")

    expect(page.locator("#btn-retry")).to_have_text("Play Again")


def test_pause_overlay_has_resume_text(page: Page):
    """Pause overlay shows instructions to resume."""
    page.goto("/")
    pause_overlay = page.locator("#overlay-pause")
    assert pause_overlay.count() == 1
    expect(pause_overlay).to_contain_text("PAUSED")


def test_theme_cycling_through_all_themes(page: Page):
    """Clicking through all five themes updates the selected state correctly."""
    page.goto("/")
    themes = ["default", "neon", "retro", "ocean", "lava"]

    for theme in themes:
        btn = page.locator(f'.theme-btn[data-theme="{theme}"]')
        btn.click()
        expect(btn).to_have_class(re.compile(r"selected"))
        # All other theme buttons should NOT be selected
        for other in themes:
            if other != theme:
                other_btn = page.locator(f'.theme-btn[data-theme="{other}"]')
                expect(other_btn).not_to_have_class(re.compile(r"selected"))


def test_start_screen_hint_text(page: Page):
    """Start screen shows a hint about right-click direction toggle."""
    page.goto("/")
    hint = page.locator(".game-hint")
    expect(hint).to_contain_text("Right-click")


def test_socket_connects_on_page_load(page: Page):
    """DaveBall.Main.isConnected() returns true after page load."""
    page.goto("/")
    wait_for_socket(page)
    connected = page.evaluate("DaveBall.Main.isConnected()")
    assert connected is True


def test_no_overlays_active_during_gameplay(page: Page):
    """After starting the game, no overlay should be active."""
    start_game(page)
    overlay_ids = [
        "overlay-start", "overlay-pause", "overlay-gameover",
        "overlay-win", "overlay-help", "overlay-highscore-entry",
        "overlay-leaderboard",
    ]
    for oid in overlay_ids:
        expect_overlay_hidden(page, oid)
