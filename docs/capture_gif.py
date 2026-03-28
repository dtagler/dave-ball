"""Capture an animated GIF of Dave Ball gameplay for the README."""
import io
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

SCREENSHOTS_DIR = Path(__file__).parent / "screenshots"
URL = "http://localhost:8080"
VIEWPORT = {"width": 800, "height": 600}

# GIF settings
FPS = 12
FRAME_DELAY = 1000 // FPS  # ms between captures
DURATION_SECS = 10
TOTAL_FRAMES = FPS * DURATION_SECS


def main():
    frames = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport=VIEWPORT)
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(2000)

        # Start game at level 2 — 3 balls, interesting but not chaotic
        page.locator("#btn-start").click()
        page.wait_for_timeout(1000)
        page.evaluate("""() => {
            const s = io(window.location.origin, {
                transports: ['polling', 'websocket']
            });
            s.on('connect', () => {
                s.emit('start_game', {
                    speed_multiplier: 1.0,
                    continue_level: 2,
                    continue_score: 500
                });
            });
        }""")

        # Wait for game to settle
        page.wait_for_timeout(3000)

        # Capture frames — draw lines at strategic moments
        for i in range(TOTAL_FRAMES):
            # Draw lines at specific frames to show the mechanic
            if i == FPS * 1:        # 1 second in — horizontal line
                page.mouse.click(400, 300, button="left")
            elif i == FPS * 3:      # 3 seconds — toggle and vertical line
                page.keyboard.press("Space")
                page.wait_for_timeout(50)
                page.mouse.click(500, 250, button="left")
            elif i == FPS * 5:      # 5 seconds — another horizontal
                page.keyboard.press("Space")
                page.wait_for_timeout(50)
                page.mouse.click(300, 400, button="left")
            elif i == FPS * 7:      # 7 seconds — vertical line
                page.keyboard.press("Space")
                page.wait_for_timeout(50)
                page.mouse.click(600, 200, button="left")

            # Capture frame
            buf = page.screenshot(type="png")
            img = Image.open(io.BytesIO(buf))
            # Quantize to 128 colors for smaller GIF
            img = img.convert("RGB").quantize(colors=128, method=Image.Quantize.MEDIANCUT)
            frames.append(img)

            page.wait_for_timeout(FRAME_DELAY)

            if (i + 1) % FPS == 0:
                print(f"  Captured {i + 1}/{TOTAL_FRAMES} frames ({(i+1)//FPS}s)")

        browser.close()

    # Assemble GIF
    print("Assembling GIF...")
    output = str(SCREENSHOTS_DIR / "gameplay.gif")
    frames[0].save(
        output,
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_DELAY,
        loop=0,
        optimize=True,
    )

    size_mb = Path(output).stat().st_size / (1024 * 1024)
    print(f"Saved: {output} ({size_mb:.1f} MB, {len(frames)} frames)")


if __name__ == "__main__":
    main()
