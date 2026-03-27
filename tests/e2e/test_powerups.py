"""Power-up verification tests – confirm the help overlay accurately
documents every power-up, hazard, and fruit available in Dave Ball.
"""

import pytest
from playwright.sync_api import Page, expect


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _open_help(page: Page) -> None:
    """Navigate and open the help overlay."""
    page.goto("/")
    page.locator("#btn-help").click()
    expect(page.locator("#overlay-help")).to_be_visible(timeout=3000)


# ---------------------------------------------------------------------------
# Power-up listing tests
# ---------------------------------------------------------------------------


POWER_UPS = [
    ("❤️", "Heart", "+1 extra life"),
    ("⏱️", "Clock", "Slow balls 50% for 10s"),
    ("🛡️", "Shield", "Next line is indestructible"),
    ("⚡", "Lightning", "Next line grows 5× speed"),
    ("💣", "Bomb", "Removes one ball"),
    ("🧊", "Freeze", "Freeze all balls for 5s"),
    ("🔍", "Shrink", "Shrink all balls for 10s"),
    ("🔗", "Fusion", "Balls merge on collision for 10s!"),
    ("🕸️", "Web", "Creates slow zones for 15s!"),
    ("🌀", "Portal", "Creates linked portals for 10s!"),
    ("🕳️", "Sinkhole", "Destroys balls that fall in for 10s!"),
    ("🐍", "Snake", "Spawns a snake that hunts balls for 10s!"),
    ("☢️", "Nuke", "Massive blast destroys nearby balls!"),
    ("🔥", "Fire", "Your next line burns balls on contact!"),
    ("🧪", "Acid", "Spawns acid pools that dissolve balls!"),
    ("🧲", "Magnet", "Attracts all balls for 5s!"),
    ("〰️", "Wave", "Balls move in wave patterns for 10s!"),
    ("🍬", "Candy", "+2000 points!"),
    ("🎲", "Mystery", "Random power-up!"),
    ("⚓", "Anchor", "Stops all balls permanently! (very rare)"),
]

HAZARDS = [
    ("☠️", "Skull", "DANGER! Costs 1 life!"),
    ("🍄", "Grow", "DANGER! Balls grow 3x for 10s!"),
    ("⚛️", "Fission", "DANGER! Ball collisions create new balls for 10s!"),
]

JACKPOT = ("💲", "Jackpot", "ULTRA RARE! Instantly clears the level!")

FRUITS = [
    ("🍒", "Cherry", "+100"),
    ("🍊", "Orange", "+200"),
    ("🍎", "Apple", "+300"),
    ("🍇", "Grape", "+500"),
    ("🍓", "Strawberry", "+1000"),
]


def test_help_screen_lists_all_powerups(page: Page):
    """Every standard power-up name is listed in the help overlay."""
    _open_help(page)

    help_el = page.locator("#overlay-help")
    for _icon, name, _desc in POWER_UPS:
        expect(help_el).to_contain_text(name)


def test_powerup_icons_in_help_overlay(page: Page):
    """Each power-up row includes its emoji icon."""
    _open_help(page)

    help_text = page.locator("#overlay-help").inner_text()
    for icon, name, _desc in POWER_UPS:
        assert icon in help_text or name in help_text, (
            f"Power-up icon '{icon}' ({name}) not found in help text"
        )


def test_powerup_descriptions_in_help_overlay(page: Page):
    """Each power-up includes its gameplay description."""
    _open_help(page)

    help_el = page.locator("#overlay-help")
    for _icon, name, desc in POWER_UPS:
        expect(help_el).to_contain_text(desc), (
            f"Description for '{name}' not found: '{desc}'"
        )


def test_hazards_listed_in_help(page: Page):
    """Hazard power-ups (Skull, Grow, Fission) are displayed with DANGER label."""
    _open_help(page)

    help_el = page.locator("#overlay-help")
    for _icon, name, desc in HAZARDS:
        expect(help_el).to_contain_text(name)
        expect(help_el).to_contain_text("DANGER!")

    # Verify hazard rows have the danger CSS class
    danger_rows = page.locator("#overlay-help .help-danger")
    expect(danger_rows).to_have_count(3)


def test_jackpot_listed_in_help(page: Page):
    """The ultra-rare Jackpot power-up is listed."""
    _open_help(page)

    help_el = page.locator("#overlay-help")
    icon, name, desc = JACKPOT
    expect(help_el).to_contain_text(name)
    expect(help_el).to_contain_text("ULTRA RARE!")

    # Jackpot has its own CSS class
    jackpot_row = page.locator("#overlay-help .help-jackpot")
    expect(jackpot_row).to_have_count(1)


def test_fruits_section_in_help(page: Page):
    """The fruits section lists all bonus fruits with point values."""
    _open_help(page)

    help_el = page.locator("#overlay-help")
    expect(help_el).to_contain_text("FRUITS")

    for _icon, name, points in FRUITS:
        expect(help_el).to_contain_text(name)
        expect(help_el).to_contain_text(points)


def test_controls_section_in_help(page: Page):
    """The controls section explains left-click, right-click, and ESC."""
    _open_help(page)

    help_el = page.locator("#overlay-help")
    expect(help_el).to_contain_text("CONTROLS")
    expect(help_el).to_contain_text("Left-click")
    expect(help_el).to_contain_text("Right-click")
    expect(help_el).to_contain_text("ESC")
    expect(help_el).to_contain_text("Pause")


def test_goal_description_in_help(page: Page):
    """The help overlay mentions the 70% fill goal."""
    _open_help(page)

    help_el = page.locator("#overlay-help")
    expect(help_el).to_contain_text("70%")
    expect(help_el).to_contain_text("Fill")


def test_total_powerup_count_in_help(page: Page):
    """The help table has exactly 20 power-up/hazard/jackpot rows."""
    _open_help(page)

    # Each power-up/hazard/jackpot is a <tr> inside .help-items-table
    rows = page.locator("#overlay-help .help-items-table tr")
    expected_count = len(POWER_UPS) + len(HAZARDS) + 1  # +1 for Jackpot = 20
    expect(rows).to_have_count(expected_count)
