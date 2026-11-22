"""6 heatmap API dla slajdu „Dane” – z backendu/cache, bez zrzutów aplikacji."""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import date, timedelta
from pathlib import Path

os.environ.setdefault("MPLBACKEND", "Agg")

import httpx
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import Patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app import sources, terrain, bdot, satellite, geo, context, czesci  # noqa: E402

OUT = ROOT / "prezentacja" / "img"
OUT.mkdir(exist_ok=True)
ID = "041005_5.0028.47/15"
D = date(2025, 7, 15)
plt.rcParams.update({
    "font.size": 11, "axes.spines.top": False, "axes.spines.right": False,
    "axes.titlesize": 12, "axes.titleweight": "bold", "figure.dpi": 140,
})


def _save(fig, name: str):
    fig.savefig(OUT / f"{name}.png", dpi=180, bbox_inches="tight", facecolor="white", pad_inches=0.06)
    plt.close(fig)
    print("→", name)


def _obrys(ax, rings, lw=1.8, c="#111"):
    for r in rings:
        xs, ys = zip(*r)
        ax.plot(xs, ys, color=c, lw=lw, zorder=5)


def _bez(ax):
    ax.set_xticks([]); ax.set_yticks([]); ax.set_aspect("equal")
    for s in ax.spines.values():
        s.set_visible(False)


def _extent_from_lonlat(lon, lat):
    return [float(lon.min()), float(lon.max()), float(lat.min()), float(lat.max())]


async def main():
    async with httpx.AsyncClient(timeout=90) as client:
        wd = await sources.dzialka(client, ident=ID)
        assert wd.ok, wd.powod
        dz = wd.dane
        rings = dz["rings"]
        lon0, lat0 = dz["lon"], dz["lat"]
        x0, y0, x1, y1 = geo.bbox(rings)
        pad = 0.0035

        # ── 1. Pogoda: heatmapa kalendarzowa P−ET0 ─────────────────────────
        wm = await sources.meteo_archiwum(client, lat0, lon0, D)
        assert wm.ok, wm.powod
        dd = wm.dane["daily"]
        start = date(D.year, 4, 1)
        vals = {}
        for t, p, e in zip(dd["time"], dd["precipitation_sum"], dd["et0_fao_evapotranspiration"]):
            d = date.fromisoformat(t)
            if start <= d <= D:
                vals[d] = (p or 0.0) - (e or 0.0)
        weeks: dict[int, dict[int, float]] = {}
        for d, v in vals.items():
            iso = d.isocalendar()
            weeks.setdefault(iso[1], {})[iso[2] - 1] = v
        wnums = sorted(weeks)
        M = np.full((len(wnums), 7), np.nan)
        for i, wn in enumerate(wnums):
            for dow, v in weeks[wn].items():
                M[i, dow] = v
        fig, ax = plt.subplots(figsize=(5.0, 3.2))
        vmax = max(8.0, float(np.nanpercentile(np.abs(M), 95)))
        im = ax.imshow(M, aspect="auto", cmap="RdBu", vmin=-vmax, vmax=vmax, interpolation="nearest")
        ax.set_xticks(range(7))
        ax.set_xticklabels(["pn", "wt", "śr", "cz", "pt", "so", "nd"])
        yticks, ylabels = [], []
        for i, wn in enumerate(wnums):
            sample = next(d for d in vals if d.isocalendar()[1] == wn)
            if sample.day <= 7 or i == 0:
                yticks.append(i)
                ylabels.append(["sty", "lut", "mar", "kwi", "maj", "cze",
                                "lip", "sie", "wrz", "paź", "lis", "gru"][sample.month - 1])
        ax.set_yticks(yticks)
        ax.set_yticklabels(ylabels)
        cb = plt.colorbar(im, ax=ax, shrink=0.85, pad=0.02)
        cb.set_label("P − ET0 [mm/d]")
        ax.set_title("Pogoda · bilans dnia (Open‑Meteo)")
        _save(fig, "hm_pogoda")

        # ── 2. Gleba: kategoria IUNG w punktach + skład SoilGrids (centroid) ─
        wi = await sources.iung_kategoria(client, rings)
        wsg = await context.soilgrids(client, lon0, lat0)
        pts = geo.grid_points(rings, 4)[:7]
        kody = (wi.dane.get("kody") if wi.ok else None) or []
        # wyrównaj długość: grid_points w tym samym porządku co iung
        fig, ax = plt.subplots(figsize=(4.5, 3.2))
        _obrys(ax, rings, lw=2)
        # wypełnij działkę kolorem kategorii (lekka gleba = jasny)
        kat = wi.dane.get("kategoria") if wi.ok else 1
        col_fill = {1: "#f0d9a8", 2: "#e0c080", 3: "#c9a46b", 4: "#a8864f", 5: "#6b5340"}.get(kat, "#e0c080")
        for r in rings:
            poly = np.array(r)
            ax.fill(poly[:, 0], poly[:, 1], color=col_fill, alpha=0.55, zorder=1)
        for i, (xx, yy) in enumerate(pts):
            k = kody[i] if i < len(kody) else kat
            if k is None or k == 0 or k == 255:
                continue
            label = str(k) if k <= 5 else "?"
            ax.plot(xx, yy, "o", ms=15, color="#C9A46B", mec="#7A4E14", mew=1.6, zorder=6)
            ax.text(xx, yy, label, ha="center", va="center", fontsize=9,
                    fontweight="bold", color="#3a2a10", zorder=7)
        sand = wsg.dane["piasek"] if wsg.ok else None
        tit = f"Gleba · kat. {kat}" if kat else "Gleba · IUNG"
        if sand is not None:
            tit += f" · {sand:.0f}% piasku (SoilGrids)"
        ax.set_xlim(x0 - pad, x1 + pad)
        ax.set_ylim(y0 - pad * 0.55, y1 + pad * 0.55)
        ax.set_title(tit)
        _bez(ax)
        _save(fig, "hm_gleba")

        # ── 3. Rzeźba terenu: DEM ───────────────────────────────────────────
        wdem = await terrain.pobierz_dem(client, rings)
        assert wdem.ok, wdem.powod
        Z, tr = wdem.dane["z"], wdem.dane["tr"]
        h, w = Z.shape
        # rasterio Affine albo krotka (a, b, c, d, e, f)
        try:
            a, _, c, _, e, f = tr.a, tr.b, tr.c, tr.d, tr.e, tr.f
        except AttributeError:
            a, _, c, _, e, f = tr[0], tr[1], tr[2], tr[3], tr[4], tr[5]
        dem_ext = [c, c + a * w, f + e * h, f]
        fig, ax = plt.subplots(figsize=(4.5, 3.2))
        im = ax.imshow(Z, extent=dem_ext, cmap="terrain",
                       vmin=float(np.nanmin(Z)) - 3, vmax=float(np.nanmax(Z)) + 2)
        _obrys(ax, rings)
        ax.set_xlim(x0 - pad * 1.2, x1 + pad * 1.2)
        ax.set_ylim(y0 - pad, y1 + pad)
        cb = plt.colorbar(im, ax=ax, shrink=0.8)
        cb.set_label("m n.p.m.")
        ax.set_title("Rzeźba · Copernicus DEM 30 m")
        _bez(ax)
        _save(fig, "hm_teren")

        # ── 4. Satelita NDMI ────────────────────────────────────────────────
        okno = (D - timedelta(days=19), D)
        wsat = await satellite.ndmi_anomalia(client, rings, D, okno)
        fig, ax = plt.subplots(figsize=(4.5, 3.2))
        plotted = False
        if wsat.ok and isinstance(wsat.dane, dict) and "r" in wsat.dane:
            r = wsat.dane["r"]
            nd = np.where(r["inside"] & r["czyste"], r["ndmi"], np.nan)
            lon, lat = r["lon"], r["lat"]
            im = ax.pcolormesh(lon, lat, nd, cmap="YlGnBu", vmin=-0.05, vmax=0.4, shading="nearest")
            plt.colorbar(im, ax=ax, shrink=0.8, label="NDMI")
            plotted = True
        else:
            # najnowszy cache s2 z danymi w okolicy
            from pathlib import Path as P
            for p in sorted((ROOT / "backend" / ".cache").glob("s2_*.npz"), key=lambda x: -x.stat().st_mtime)[:30]:
                z = np.load(p)
                if "ndmi" not in z.files or "lon" not in z.files:
                    continue
                lon, lat, ndmi, inside = z["lon"], z["lat"], z["ndmi"], z["inside"]
                if not (lon.min() <= lon0 <= lon.max() and lat.min() <= lat0 <= lat.max()):
                    continue
                nd = np.where(inside, ndmi, np.nan)
                if np.isfinite(nd).sum() < 20:
                    continue
                im = ax.pcolormesh(lon, lat, nd, cmap="YlGnBu", vmin=-0.05, vmax=0.4, shading="nearest")
                plt.colorbar(im, ax=ax, shrink=0.8, label="NDMI")
                plotted = True
                break
        if not plotted:
            # ostateczny fallback: notebook fig
            from PIL import Image as PILImage
            src = ROOT / "notebooks" / "fig" / "a11_ndmi.png"
            ax.imshow(PILImage.open(src))
            ax.set_xticks([]); ax.set_yticks([])
            for s in ax.spines.values():
                s.set_visible(False)
            ax.set_title("Wilgotność · Sentinel‑2 NDMI")
            _save(fig, "hm_ndmi")
        else:
            _obrys(ax, rings)
            ax.set_xlim(x0 - pad * 0.35, x1 + pad * 0.35)
            ax.set_ylim(y0 - pad * 0.25, y1 + pad * 0.25)
            ax.set_title("Wilgotność · Sentinel‑2 NDMI")
            _bez(ax)
            _save(fig, "hm_ndmi")

        # ── 5. Rowy, cieki, zbiorniki ───────────────────────────────────────
        wh = await bdot.hydrografia(rings, dz["teryt"] or dz["id"])
        assert wh.ok, wh.powod
        hyd = wh.dane
        KOL = {"SWRM_L": "#1f6fc9", "SWRS_L": "#0b3d91", "SWKN_L": "#4b8fe0", "PTWP_A": "#7fb3ea"}
        fig, ax = plt.subplots(figsize=(4.5, 3.2))
        ax.imshow(Z, extent=dem_ext, cmap="Greys", alpha=0.22,
                  vmin=float(np.nanmin(Z)), vmax=float(np.nanmax(Z)))
        for l in hyd["linie"]:
            c = np.array(l["c"])
            ax.plot(c[:, 0], c[:, 1], color=KOL.get(l["typ"], "#1f6fc9"),
                    lw=2.8 if l["typ"] == "SWRM_L" else 1.7, solid_capstyle="round", zorder=3)
        _obrys(ax, rings, lw=2)
        rw = hyd["najblizsze"].get("SWRM_L")
        if rw:
            ax.plot(rw["lon"], rw["lat"], "o", color="#e0622c", ms=9, zorder=6)
            ax.annotate(f"rów {rw['dist_m']:.0f} m", (rw["lon"], rw["lat"]),
                        xytext=(10, -12), textcoords="offset points",
                        color="#e0622c", fontweight="bold", fontsize=11)
        ax.set_xlim(x0 - pad * 1.5, x1 + pad * 1.5)
        ax.set_ylim(y0 - pad, y1 + pad)
        ax.set_title("Rowy · cieki · zbiorniki (BDOT10k)")
        _bez(ax)
        _save(fig, "hm_hydro")

        # ── 6. Uprawy – split kolorami ──────────────────────────────────────
        wc = await czesci.czesci_dzialki(client, rings, 2025)
        assert wc.ok, wc.powod
        PAL = {
            "kukurydza": "#e8b84a", "pszenica": "#c9a227", "zboza_jare": "#d4a017",
            "jeczmien": "#b8892a", "burak": "#8fbf5a", "rzepak": "#6b8e23",
            "laka": "#5a9e6f", "brak": "#cfc8b8",
        }
        fig, ax = plt.subplots(figsize=(4.5, 3.2))
        legend_items = []
        seen = set()
        for cz in wc.dane:
            geom = cz.get("geometria")
            if not geom:
                continue
            key = cz.get("uprawa") or "brak"
            col = PAL.get(key, "#8a8f87")
            for poly in geom["coordinates"]:
                exterior = np.array(poly[0])
                ax.fill(exterior[:, 0], exterior[:, 1], color=col, alpha=0.88,
                        ec="#1a1c19", lw=1.2, zorder=3)
                for hole in poly[1:]:
                    hh = np.array(hole)
                    ax.fill(hh[:, 0], hh[:, 1], color="white", ec="#1a1c19", lw=0.8, zorder=4)
            label = f"{cz.get('nazwa') or key} · {cz.get('ha', 0):.2f} ha"
            if label not in seen:
                seen.add(label)
                legend_items.append(Patch(facecolor=col, edgecolor="#1a1c19", label=label))
        _obrys(ax, rings, lw=2.2)
        ax.set_xlim(x0 - pad * 0.45, x1 + pad * 0.45)
        ax.set_ylim(y0 - pad * 0.3, y1 + pad * 0.3)
        ax.legend(handles=legend_items, loc="lower left", fontsize=9, frameon=True,
                  fancybox=False, edgecolor="#e2e2d6")
        ax.set_title("Uprawy na działce · ARiMR 2025")
        _bez(ax)
        _save(fig, "hm_uprawy")

    print("ok")


if __name__ == "__main__":
    asyncio.run(main())
