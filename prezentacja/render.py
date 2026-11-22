"""slajdy.html → Asystent_Wodny_prezentacja.pdf (+ podgląd PNG każdego slajdu w img/podglad)."""
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
PREV = HERE / "img" / "podglad"
PREV.mkdir(exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome")
    pg = b.new_page(viewport={"width": 1920, "height": 1080})
    pg.goto((HERE / "slajdy.html").as_uri(), wait_until="networkidle")
    pg.evaluate("document.fonts.ready")
    pg.wait_for_timeout(800)
    for i, s in enumerate(pg.locator("section.slide").all(), 1):
        s.screenshot(path=PREV / f"slajd_{i:02d}.png")
    pg.pdf(path=HERE / "Asystent_Wodny_prezentacja.pdf", width="1920px", height="1080px", print_background=True,
           prefer_css_page_size=True)
    b.close()
print("ok")
