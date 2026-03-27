"""Pytest fixtures for Playwright end-to-end tests.

Overlays in Dave Ball use ``opacity: 0/1`` via the ``.active`` CSS class,
NOT ``display: none``.  Playwright's ``to_be_visible()`` checks bounding-box
presence, so overlays are *always* "visible" to Playwright.  Use the helpers
``expect_overlay_shown`` / ``expect_overlay_hidden`` (which assert on the
``.active`` class) instead of ``to_be_visible`` / ``not_to_be_visible``.
"""

import re
import urllib.request
import urllib.error
import time

import pytest
from playwright.sync_api import Page, expect


BASE_URL = "http://frontend:80"

# Matches the word "active" as a standalone CSS class
_ACTIVE_RE = re.compile(r"\bactive\b")


@pytest.fixture(scope="session")
def base_url():
    """Base URL pointing to the frontend service inside Docker."""
    return BASE_URL


@pytest.fixture(scope="session", autouse=True)
def wait_for_app():
    """Block until the frontend is reachable, polling every second."""
    timeout = 30
    start = time.time()
    while time.time() - start < timeout:
        try:
            urllib.request.urlopen(BASE_URL, timeout=5)
            return
        except (urllib.error.URLError, ConnectionError, OSError):
            time.sleep(1)
    pytest.fail(f"Frontend at {BASE_URL} not ready after {timeout}s")


@pytest.fixture(scope="session")
def browser_type_launch_args():
    """Launch the browser in headless mode."""
    return {"headless": True}


@pytest.fixture(scope="session")
def browser_context_args():
    """Set viewport to 800x700 to fit the 800x650 game canvas."""
    return {
        "viewport": {"width": 800, "height": 700},
        "base_url": BASE_URL,
    }


def wait_for_socket(page: Page, timeout: int = 15000):
    """Wait until the Socket.IO connection is established."""
    page.wait_for_function(
        "() => window.DaveBall && window.DaveBall.Main && window.DaveBall.Main.isConnected && window.DaveBall.Main.isConnected()",
        timeout=timeout,
    )


def expect_overlay_shown(page: Page, overlay_id: str, timeout: int = 5000):
    """Assert an overlay has the ``active`` CSS class (i.e. is visible)."""
    expect(page.locator(f"#{overlay_id}")).to_have_class(_ACTIVE_RE, timeout=timeout)


def expect_overlay_hidden(page: Page, overlay_id: str, timeout: int = 10000):
    """Assert an overlay does NOT have the ``active`` CSS class."""
    expect(page.locator(f"#{overlay_id}")).not_to_have_class(_ACTIVE_RE, timeout=timeout)


def start_game(page: Page):
    """Navigate, wait for socket, click Play, wait for overlay to hide."""
    page.goto("/")
    wait_for_socket(page)
    page.locator("#btn-start").click()
    expect_overlay_hidden(page, "overlay-start")
