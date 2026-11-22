"""Zrzuty aplikacji do prezentacji (Chrome przez Playwright). Uruchom: python prezentacja/shots.py [etap]"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

APP = "http://localhost:3000"
DZ = "041005_5.0028.47/15"
DATA = "2025-07-15"
OUT = Path(__file__).parent / "img"
OUT.mkdir(exist_ok=True)
etap = sys.argv[1] if len(sys.argv) > 1 else "all"

# MapLibre instance from the React fiber of the map container (useRef in the component; dev build).
GRAB_MAP = """(sel) => {
  const el = document.querySelector(sel);
  let f = el[Object.keys(el).find(k => k.startsWith('__reactFiber'))];
  while (f) {
    for (let h = f.memoizedState; h && typeof h === 'object'; h = h.next) {
      const v = h.memoizedState;
      if (v && v.current && typeof v.current.getZoom === 'function') { window.__map = v.current; return true; }
    }
    f = f.return;
  }
  return false;
}"""


def clip_pick(pg):
    """From the parcel-mode tabs down to the crop row of the found-parcel card."""
    t = pg.get_by_role("tablist", name="Sposób wskazania działki").bounding_box()
    u = pg.get_by_text("Uprawa:", exact=False).first
    c = u.bounding_box()
    k = u.locator("xpath=ancestor::*[contains(@class,'rounded')][1]").bounding_box()
    sy = pg.evaluate("() => window.scrollY")
    return {"x": t["x"] - 8, "y": t["y"] - 8 + sy, "width": k["x"] + k["width"] - t["x"] + 16, "height": c["y"] + 46 - t["y"]}


def ctx(p, w=1440, h=900, mobile=False):
    b = p.chromium.launch(channel="chrome")
    c = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, is_mobile=mobile,
                      has_touch=mobile, color_scheme="light", locale="pl-PL")
    return b, c.new_page()


with sync_playwright() as p:
    if etap in ("all", "start"):
        b, pg = ctx(p)
        pg.goto(f"{APP}/?dzialka={DZ}&data={DATA}", wait_until="networkidle")
        pg.add_style_tag(content="nextjs-portal{display:none!important}")
        pg.wait_for_timeout(3000)
        pg.screenshot(path=OUT / "start_full.png", full_page=True)
        pg.screenshot(path=OUT / "s1_start.png")
        pg.screenshot(path=OUT / "s2_id.png", clip=clip_pick(pg), full_page=True)
        pg.get_by_role("tab", name="Gmina, obręb, numer").click()
        pg.wait_for_timeout(500)
        pg.screenshot(path=OUT / "start_nazwa.png", full_page=True)
        pg.get_by_role("tab", name="Kliknij na mapie").click()
        pg.wait_for_timeout(6000)
        pg.screenshot(path=OUT / "start_mapa.png", full_page=True)
        b.close()
    if etap in ("all", "mapa"):
        import math
        b, pg = ctx(p)
        pg.add_style_tag  # noqa
        pg.goto(f"{APP}/?data={DATA}", wait_until="networkidle")
        pg.add_style_tag(content="nextjs-portal{display:none!important}")
        pg.get_by_role("tab", name="Gmina, obręb, numer").click()
        pola = pg.locator("input:visible")
        pg.wait_for_timeout(300)
        ins = pg.locator("label:has-text('Gmina') input, label:has-text('Obręb') input, label:has-text('Numer działki') input")
        for i, v in enumerate(["Szubin", "Stanisławka", "47/15"]):
            ins.nth(i).fill(v)
        pg.wait_for_timeout(4000)
        pg.screenshot(path=OUT / "start_nazwa.png", full_page=True)
        pg.screenshot(path=OUT / "s2_nazwa.png", clip=clip_pick(pg), full_page=True)
        pg.get_by_role("tab", name="Kliknij na mapie").click()
        pg.wait_for_timeout(5000)
        sel = "[aria-label='Mapa: kliknij swoją działkę']"
        pg.wait_for_selector(sel, timeout=30000)
        pg.wait_for_timeout(3000)
        pg.wait_for_selector(sel, timeout=30000)
        pg.wait_for_timeout(3000)
        pg.evaluate(GRAB_MAP, sel)
        pg.evaluate("() => window.__map.jumpTo({center: [17.7619, 53.0448], zoom: 15.6})")
        pg.wait_for_timeout(12000)
        box = pg.locator(sel).bounding_box()
        pt = pg.evaluate("() => window.__map.project([17.761204, 53.044935])")
        px, py = box["x"] + pt["x"], box["y"] + pt["y"]
        pg.screenshot(path=OUT / "start_mapa_zoom.png", full_page=True)
        pg.mouse.click(px, py)
        pg.wait_for_timeout(9000)
        pg.screenshot(path=OUT / "start_mapa_klik.png", full_page=True)
        pg.screenshot(path=OUT / "s2_mapa.png", clip=clip_pick(pg), full_page=True)
        b.close()
    if etap in ("all", "raport"):
        b, pg = ctx(p)
        pg.goto(f"{APP}/raport?dzialka={DZ}&data={DATA}", wait_until="networkidle", timeout=180000)
        pg.add_style_tag(content="nextjs-portal{display:none!important}")
        pg.wait_for_timeout(6000)
        pg.screenshot(path=OUT / "raport_full.png", full_page=True)

        def card(text, name, xp="ancestor::*[contains(@class,'rounded')][1]"):
            el = pg.get_by_text(text, exact=False).first
            box = el.locator(f"xpath={xp}")
            if not box.count():
                print("brak", text)
                return
            box.scroll_into_view_if_needed(timeout=5000)
            pg.wait_for_timeout(600)
            box.screenshot(path=OUT / name)

        card("Kukurydza już cierpi", "r_status.png")
        card("Co zrobić i gdzie", "r_akcje.png", "../..")
        card("Co czeka działkę", "r_scenariusze.png")
        card("Jak często brakowało wody", "r_historia.png")
        card("Co zwiększa ryzyko", "r_przyczyny.png")
        card("Skąd wiemy", "r_zrodla.png")
        mp = pg.locator("[aria-label^='Mapa działki']").first
        mp.scroll_into_view_if_needed()
        pod = pg.get_by_role("button", name="Podsumowanie")
        if pod.count():
            pod.first.click()
        for nazwa, plik in [("Plan działań", "plan"), ("Gdzie sucho", "sucho"), ("Teren i spływ", "teren"), ("Gleba", "gleba")]:
            pg.get_by_role("tab", name=nazwa).first.click()
            pg.wait_for_timeout(4000)
            mp.screenshot(path=OUT / f"m_{plik}.png")
        b.close()
    if etap in ("all", "mobile"):
        b, pg = ctx(p, 390, 844, mobile=True)
        pg.goto(f"{APP}/raport?dzialka={DZ}&data={DATA}", wait_until="networkidle", timeout=180000)
        pg.add_style_tag(content="nextjs-portal{display:none!important}")
        pg.wait_for_timeout(5000)
        pg.screenshot(path=OUT / "mob_raport.png")
        pg.goto(f"{APP}/?dzialka={DZ}&data={DATA}", wait_until="networkidle")
        pg.add_style_tag(content="nextjs-portal{display:none!important}")
        pg.wait_for_timeout(3000)
        pg.screenshot(path=OUT / "mob_start.png")
        b.close()
