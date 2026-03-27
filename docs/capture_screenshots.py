"""Capture screenshots of Dave Ball for the README."""
from pathlib import Path
from playwright.sync_api import sync_playwright

SCREENSHOTS_DIR = Path(__file__).parent / "screenshots"
SCREENSHOTS_DIR.mkdir(exist_ok=True)

URL = "http://localhost:8080"
VIEWPORT = {"width": 1024, "height": 768}


def start_at_level(page, level, speed=1.5, score=4200):
    """Start the game at a specific level via socket."""
    page.evaluate("""(opts) => {
        const s = io(window.location.origin, {
            transports: ['polling', 'websocket']
        });
        s.on('connect', () => {
            s.emit('start_game', {
                speed_multiplier: opts.speed,
                continue_level: opts.level,
                continue_score: opts.score
            });
        });
    }""", {"level": level, "speed": speed, "score": score})


def click_to_draw_line(page, x, y):
    """Click on the canvas to start drawing a line."""
    page.mouse.click(x, y, button="left")


def save(page, name):
    path = str(SCREENSHOTS_DIR / f"{name}.png")
    page.screenshot(path=path, full_page=False)
    print(f"Saved: {path}")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport=VIEWPORT)

        # 1. Start screen
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(2000)
        save(page, "start-screen")

        # 2. How To Play
        page.locator("#btn-help").click()
        page.wait_for_timeout(1000)
        save(page, "how-to-play")

        # 3. Gameplay — level 5 with obstacles and multiple balls
        page.locator("#btn-help-back").click()
        page.wait_for_timeout(500)
        page.locator("#btn-start").click()
        page.wait_for_timeout(1000)
        start_at_level(page, level=5, speed=1.5, score=4200)
        page.wait_for_timeout(6000)
        save(page, "gameplay")

        # 4. Lines being drawn — start at level 3, draw a couple of lines
        start_at_level(page, level=3, speed=1.0, score=1500)
        page.wait_for_timeout(3000)
        # Draw a horizontal line near the center
        click_to_draw_line(page, 450, 350)
        page.wait_for_timeout(400)
        # Draw another line while the first is still growing
        click_to_draw_line(page, 300, 250)
        page.wait_for_timeout(300)
        save(page, "lines-growing")

        # 5. Power-ups and shapes — level 8 has more power-ups and obstacles
        start_at_level(page, level=8, speed=1.0, score=8000)
        page.wait_for_timeout(8000)
        # Draw a line to show active gameplay with power-ups visible
        click_to_draw_line(page, 500, 300)
        page.wait_for_timeout(500)
        save(page, "powerups-and-shapes")

        # 6. Advanced gameplay — level 12 with many balls and effects
        start_at_level(page, level=12, speed=1.5, score=15000)
        page.wait_for_timeout(8000)
        click_to_draw_line(page, 400, 400)
        page.wait_for_timeout(400)
        click_to_draw_line(page, 600, 200)
        page.wait_for_timeout(300)
        save(page, "advanced-gameplay")

        browser.close()
        print("Done!")


if __name__ == "__main__":
    main()
