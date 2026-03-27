"""Capture screenshots of Dave Ball for the README."""
from pathlib import Path
from playwright.sync_api import sync_playwright

SCREENSHOTS_DIR = Path(__file__).parent / "screenshots"
SCREENSHOTS_DIR.mkdir(exist_ok=True)

URL = "http://localhost:8080"
VIEWPORT = {"width": 1024, "height": 768}
GAMEPLAY_LEVEL = 5  # Level 5 = 6 balls + obstacles


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport=VIEWPORT)

        # 1. Start screen
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(2000)
        path = str(SCREENSHOTS_DIR / "start-screen.png")
        page.screenshot(path=path, full_page=False)
        print(f"Saved: {path}")

        # 2. How To Play (from start screen)
        page.locator("#btn-help").click()
        page.wait_for_timeout(1000)
        path = str(SCREENSHOTS_DIR / "how-to-play.png")
        page.screenshot(path=path, full_page=False)
        print(f"Saved: {path}")

        # 3. Gameplay — jump to a higher level for an exciting screenshot.
        #    First click the real Start button so the frontend hides the overlay.
        #    Then immediately restart at a higher level via a second socket.
        #    The backend broadcasts to ALL clients, so the frontend renders it.
        page.locator("#btn-help-back").click()
        page.wait_for_timeout(500)
        page.locator("#btn-start").click()
        page.wait_for_timeout(1000)

        # Restart at a higher level via a second socket connection
        page.evaluate("""() => {
            const s = io(window.location.origin, {
                transports: ['websocket', 'polling']
            });
            s.on('connect', () => {
                s.emit('start_game', {
                    speed_multiplier: 1.5,
                    continue_level: """ + str(GAMEPLAY_LEVEL) + """,
                    continue_score: 4200
                });
            });
        }""")

        # Let the game run so balls spread out and power-ups appear
        page.wait_for_timeout(6000)
        path = str(SCREENSHOTS_DIR / "gameplay.png")
        page.screenshot(path=path, full_page=False)
        print(f"Saved: {path}")

        browser.close()
        print("Done!")


if __name__ == "__main__":
    main()
