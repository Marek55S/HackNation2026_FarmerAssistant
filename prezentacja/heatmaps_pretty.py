"""Ładne, prezentacyjne heatmapy API (mock OK) – prawdziwy obrys działki 47/15."""
from __future__ import annotations

import json
import os
from pathlib import Path

os.environ.setdefault("MPLBACKEND", "Agg")
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
from matplotlib.colors import LinearSegmentedColormap, ListedColormap
from matplotlib.path import Path as MPath

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "img"
RINGS = json.loads((OUT / "_rings.json").read_text(encoding="utf-8"))
RING = np.array(RINGS[0])  # (lon, lat)

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 11,
    "axes.titlesize": 13,
    "axes.titleweight": "bold",
    "figure.dpi": 160,
})


def _bbox(pad=0.0018):
    x0, y0 = RING.min(0)
    x1, y1 = RING.max(0)
    return x0 - pad, y0 - pad * 0.7, x1 + pad, y1 + pad * 0.7


def _mask_grid(nx=90, ny=70, pad=0.0025):
    x0, y0, x1, y1 = _bbox(pad)
    xs = np.linspace(x0, x1, nx)
    ys = np.linspace(y0, y1, ny)
    XX, YY = np.meshgrid(xs, ys)
    poly = MPath(RING)
    inside = poly.contains_points(np.c_[XX.ravel(), YY.ravel()]).reshape(XX.shape)
    return xs, ys, XX, YY, inside, (x0, x1, y0, y1)


def _obrys(ax, lw=2.4):
    ax.plot(RING[:, 0], RING[:, 1], color="#1a1c19", lw=lw, zorder=10, solid_joinstyle="round")


def _panel(ax, title, extent):
    ax.set_xlim(extent[0], extent[1])
    ax.set_ylim(extent[2], extent[3])
    ax.set_aspect("equal")
    ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_title(title, pad=8)
    ax.set_facecolor("#f7f6f1")


def _save(fig, name):
    fig.savefig(OUT / f"{name}.png", dpi=200, bbox_inches="tight", facecolor="white", pad_inches=0.08)
    plt.close(fig)
    print("→", name)


def pogoda():
    """Kalendarzowa heatmapa P−ET0 – czytelna, ładna, z legendą."""
    rng = np.random.default_rng(7)
    # 16 tygodni × 7 dni (kwi–lip)
    weeks = 16
    M = rng.normal(-1.2, 2.2, size=(weeks, 7))
    # kilka ulew
    for (i, j, v) in [(1, 1, 9), (4, 3, 7), (8, 4, 11), (11, 0, 6), (14, 5, 5)]:
        M[i, j] = v
    # suchy okres koniec czerwca
    M[10:13, :] = np.clip(M[10:13, :] - 2.5, -8, 4)

    fig, ax = plt.subplots(figsize=(5.4, 3.5))
    cmap = LinearSegmentedColormap.from_list("bal", ["#b2182b", "#f7f7f7", "#2166ac"])
    im = ax.imshow(M, aspect="auto", cmap=cmap, vmin=-7, vmax=7, interpolation="nearest")
    ax.set_xticks(range(7))
    ax.set_xticklabels(["pn", "wt", "śr", "cz", "pt", "so", "nd"], fontsize=10)
    # etykiety miesięcy
    labels = ["kwi", "", "", "", "maj", "", "", "", "cze", "", "", "", "lip", "", "", ""]
    ax.set_yticks(range(weeks))
    ax.set_yticklabels(labels, fontsize=10)
    for spine in ax.spines.values():
        spine.set_visible(False)
    cb = plt.colorbar(im, ax=ax, shrink=0.88, pad=0.03)
    cb.set_label("P − ET0  [mm/dzień]", fontsize=10)
    cb.outline.set_visible(False)
    ax.set_title("Pogoda · bilans dnia  (Open‑Meteo)", pad=10)
    # mała legenda tekstowa
    ax.text(0.02, -0.14, "czerwony = deficyt wody   ·   niebieski = nadwyżka opadu",
            transform=ax.transAxes, fontsize=9, color="#5a635c")
    _save(fig, "hm_pogoda")


def gleba():
    """Heatmapa % piasku w działce + punkty IUNG."""
    xs, ys, XX, YY, inside, ext = _mask_grid(100, 75)
    # gradient: więcej piasku na zachodzie (jak realnie lekkie gleby)
    sand = 62 + 18 * (1 - (XX - XX.min()) / (XX.max() - XX.min()))
    sand += 4 * np.sin((YY - YY.min()) * 800)
    sand = np.where(inside, sand, np.nan)

    fig, ax = plt.subplots(figsize=(4.8, 3.5))
    cmap = LinearSegmentedColormap.from_list("sand", ["#6b5340", "#c9a46b", "#f0e0b8", "#f7efd6"])
    im = ax.pcolormesh(XX, YY, sand, cmap=cmap, vmin=55, vmax=85, shading="nearest")
    _obrys(ax)
    # punkty IUNG kat. I – losuj wewnątrz działki
    poly = MPath(RING)
    rng = np.random.default_rng(3)
    pts = []
    x0, y0, x1, y1 = RING[:, 0].min(), RING[:, 1].min(), RING[:, 0].max(), RING[:, 1].max()
    while len(pts) < 6:
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
        if poly.contains_point((x, y)):
            pts.append((x, y))
    for x, y in pts:
        ax.plot(x, y, "o", ms=11, color="#fff", mec="#7A4E14", mew=1.6, zorder=12)
        ax.text(x, y, "I", ha="center", va="center", fontsize=8, fontweight="bold",
                color="#7A4E14", zorder=13)
    cb = plt.colorbar(im, ax=ax, shrink=0.82, pad=0.02)
    cb.set_label("% piasku (SoilGrids)", fontsize=10)
    cb.outline.set_visible(False)
    _panel(ax, "Gleba · kat. IUNG I  ·  ~71% piasku", ext)
    _save(fig, "hm_gleba")


def teren():
    """DEM + kierunek spływu + punkt wypływu."""
    xs, ys, XX, YY, inside, ext = _mask_grid(110, 85, pad=0.0032)
    # wysokość: wyżej na NE, niżej przy SW (wypływ)
    lon0, lat0 = RING.mean(0)
    Z = 88 + 6 * ((XX - lon0) * 400) - 5 * ((YY - lat0) * 500)
    Z += 1.2 * np.sin((XX - lon0) * 900) * np.cos((YY - lat0) * 700)
    # poza działką też pokazujemy kontekst
    Z_show = Z.copy()

    fig, ax = plt.subplots(figsize=(4.8, 3.5))
    im = ax.pcolormesh(XX, YY, Z_show, cmap="terrain", shading="nearest",
                       vmin=Z.min() - 1, vmax=Z.max() + 1)
    # maska półprzezroczysta poza działką
    outside = np.ma.masked_where(inside, np.ones_like(Z))
    ax.pcolormesh(XX, YY, outside, cmap=ListedColormap(["#ffffff"]), alpha=0.35, shading="nearest")
    _obrys(ax)
    # strzałki spływu (mock D8)
    step = 8
    for i in range(5, inside.shape[0] - 5, step):
        for j in range(5, inside.shape[1] - 5, step):
            if not inside[i, j]:
                continue
            # gradient lokalny → kierunek w dół
            gy = Z[i + 1, j] - Z[i - 1, j]
            gx = Z[i, j + 1] - Z[i, j - 1]
            ax.annotate("", xy=(XX[i, j] - gx * 0.000015, YY[i, j] - gy * 0.000015),
                        xytext=(XX[i, j], YY[i, j]),
                        arrowprops=dict(arrowstyle="->", color="#123f78", lw=1.0, alpha=0.7),
                        zorder=8)
    # wypływ
    out_pt = (17.76055, 53.04455)
    ax.plot(*out_pt, marker="*", ms=18, color="#c2362f", mec="white", mew=1.2, zorder=15)
    ax.annotate("wypływ 53%", out_pt, xytext=(12, -16), textcoords="offset points",
                color="#c2362f", fontweight="bold", fontsize=11, zorder=15)
    cb = plt.colorbar(im, ax=ax, shrink=0.82, pad=0.02)
    cb.set_label("m n.p.m.", fontsize=10)
    cb.outline.set_visible(False)
    _panel(ax, "Rzeźba · Copernicus DEM + spływ D8", ext)
    _save(fig, "hm_teren")


def ndmi():
    """Wilgotność roślin – żółty=sucho, niebieski=wilgotno."""
    xs, ys, XX, YY, inside, ext = _mask_grid(100, 75)
    lon0, lat0 = RING.mean(0)
    # suchsza zachodnia część działki (jak w realnym NDMI)
    nd = 0.22 - 0.18 * ((XX.max() - XX) / (XX.max() - XX.min()))
    nd += 0.06 * np.sin((YY - lat0) * 900)
    nd += 0.04 * ((YY - lat0) * 200)
    nd = np.where(inside, nd, np.nan)

    fig, ax = plt.subplots(figsize=(4.8, 3.5))
    cmap = LinearSegmentedColormap.from_list("ndmi", ["#f7f061", "#a8d08d", "#4ea8a0", "#1f4e79"])
    im = ax.pcolormesh(XX, YY, nd, cmap=cmap, vmin=0.02, vmax=0.38, shading="nearest")
    _obrys(ax)
    # znacznik najsuchszego miejsca
    dry = np.nanargmin(nd)
    di, dj = np.unravel_index(dry, nd.shape)
    ax.plot(XX[di, dj], YY[di, dj], "X", ms=12, color="#c2362f", mew=2, zorder=12)
    ax.annotate("najsuchsze\n2,3 ha", (XX[di, dj], YY[di, dj]), xytext=(-55, 18),
                textcoords="offset points", color="#c2362f", fontsize=10, fontweight="bold",
                arrowprops=dict(arrowstyle="-", color="#c2362f", lw=1))
    cb = plt.colorbar(im, ax=ax, shrink=0.82, pad=0.02)
    cb.set_label("NDMI (woda w liściach)", fontsize=10)
    cb.outline.set_visible(False)
    _panel(ax, "Wilgotność · Sentinel‑2 NDMI", ext)
    _save(fig, "hm_ndmi")


def hydro():
    """Rowy, cieki, zbiornik wokół działki."""
    xs, ys, XX, YY, inside, ext = _mask_grid(90, 70, pad=0.004)
    # lekki teren w tle
    Z = 86 + 4 * (XX - XX.mean()) * 300 - 3 * (YY - YY.mean()) * 400

    fig, ax = plt.subplots(figsize=(4.8, 3.5))
    ax.pcolormesh(XX, YY, Z, cmap="Greys", shading="nearest", alpha=0.35,
                  vmin=Z.min(), vmax=Z.max())
    _obrys(ax, lw=2.6)

    # rów tuż przy południowej granicy działki (poza nią)
    bot = RING[RING[:, 1].argsort()[:6]]
    bot = bot[bot[:, 0].argsort()]
    row = bot.copy()
    row[:, 1] -= 0.00028
    # przedłuż
    row = np.vstack([[row[0, 0] - 0.001, row[0, 1]], row, [row[-1, 0] + 0.002, row[-1, 1] + 0.0001]])
    ax.plot(row[:, 0], row[:, 1], color="#1f6fc9", lw=3.4, solid_capstyle="round", zorder=8,
            label="rów melioracyjny")
    # ciek na północ
    y_top = RING[:, 1].max() + 0.00055
    ciek = np.array([[RING[:, 0].min() - 0.001, y_top],
                     [RING[:, 0].mean(), y_top + 0.00015],
                     [RING[:, 0].max() + 0.001, y_top + 0.00025]])
    ax.plot(ciek[:, 0], ciek[:, 1], color="#0b3d91", lw=2.4, zorder=7, label="ciek")
    # zbiornik na wschód
    theta = np.linspace(0, 2 * np.pi, 60)
    cx, cy = RING[:, 0].max() + 0.0012, RING[:, 1].mean() + 0.0003
    rx, ry = 0.0007, 0.0004
    ax.fill(cx + rx * np.cos(theta), cy + ry * np.sin(theta),
            color="#7fb3ea", ec="#0b3d91", lw=1.2, alpha=0.9, zorder=7, label="zbiornik")

    # punkt najbliższego rowu
    pt = (float(np.median(bot[:, 0])), float(np.min(bot[:, 1]) - 0.00028))
    ax.plot(*pt, "o", ms=12, color="#e0622c", mec="white", mew=1.5, zorder=12)
    ax.annotate("rów 3 m", pt, xytext=(16, -18), textcoords="offset points",
                color="#e0622c", fontweight="bold", fontsize=12, zorder=12)

    ax.legend(loc="upper left", fontsize=9, frameon=True, fancybox=False,
              edgecolor="#ddd", framealpha=0.95)
    _panel(ax, "Rowy · cieki · zbiorniki  (BDOT10k)", ext)
    _save(fig, "hm_hydro")


def uprawy():
    """Split kolorami: kukurydza + mały pas zbóż jarych."""
    fig, ax = plt.subplots(figsize=(4.8, 3.5))
    # cała działka = kukurydza
    ax.fill(RING[:, 0], RING[:, 1], color="#e8b84a", ec="#1a1c19", lw=2.2, zorder=3)

    # płat zbóż jarych przy zachodnim wcięciu – czytelny na slajdzie
    x0 = RING[:, 0].min()
    y0 = RING[:, 1].min()
    spring = np.array([
        [x0 + 0.00015, y0 + 0.00055],
        [x0 + 0.00110, y0 + 0.00050],
        [x0 + 0.00135, y0 + 0.00110],
        [x0 + 0.00085, y0 + 0.00155],
        [x0 + 0.00020, y0 + 0.00135],
        [x0 + 0.00015, y0 + 0.00055],
    ])
    ax.fill(spring[:, 0], spring[:, 1], color="#6b7c3c", ec="#1a1c19", lw=1.6, zorder=4)

    x0, y0, x1, y1 = _bbox(0.0015)
    ax.set_xlim(x0, x1); ax.set_ylim(y0, y1)
    ax.set_aspect("equal")
    ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_facecolor("#f7f6f1")
    ax.set_title("Uprawy na działce · ARiMR 2025", pad=8)

    handles = [
        mpatches.Patch(facecolor="#e8b84a", edgecolor="#1a1c19", label="Kukurydza · 9,73 ha"),
        mpatches.Patch(facecolor="#6b7c3c", edgecolor="#1a1c19", label="Zboża jare · 0,12 ha"),
    ]
    ax.legend(handles=handles, loc="lower left", fontsize=10, frameon=True,
              fancybox=False, edgecolor="#ddd")
    _save(fig, "hm_uprawy")


if __name__ == "__main__":
    pogoda()
    gleba()
    teren()
    ndmi()
    hydro()
    uprawy()
    print("ok")
