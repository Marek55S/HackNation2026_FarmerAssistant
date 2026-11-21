"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFarm, type FarmParcel } from "@/lib/farm";
import type { AnalysisStatus, CropId, Parcel, Report } from "@/lib/types";
import { MobileNav } from "../mobile-nav";
import { Card, ICON, Icon, Logo, StepNumber } from "../ui";
import { DatePicker } from "./date-picker";
import { ParcelPicker } from "./parcel-picker";
import { FarmPanel, ProgressPanel } from "./side-panels";

export function StartScreen({ today, initialParcelId }: { today: string; initialParcelId: string }) {
  const router = useRouter();
  const { farm, upsert } = useFarm();
  const [parcel, setParcel] = useState<Parcel | null>(null);
  const [crop, setCrop] = useState<CropId | null>(null);
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState<AnalysisStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const cancelled = useRef(false);

  useEffect(() => () => void (cancelled.current = true), []);

  const onParcel = useCallback((p: Parcel | null) => {
    setParcel(p);
    setCrop(null);
  }, []);

  const saveToFarm = useCallback(
    (report: Report, url: string) => {
      const p = report.parcel;
      const entry: FarmParcel = {
        parcelId: p.id,
        name: `${p.number} · ${report.crop.name.toLowerCase()}`,
        meta: `${p.areaHa.toLocaleString("pl-PL")} ha · ${report.urgent.title.toLowerCase()}`,
        status: report.status.tone === "danger" ? "Pilne" : report.status.tone === "plan" ? "Zrób przed zimą" : "W porządku",
        tone: report.status.tone === "ok" ? "ok" : "danger",
        url,
        checkedAt: new Date().toISOString(),
      };
      upsert(entry);
    },
    [upsert],
  );

  async function start() {
    if (!parcel || running) return;
    setRunning(true);
    setError(null);
    setStatus(null);
    // On phones the progress panel is below the form.
    setTimeout(() => progressRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    try {
      const res = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parcelId: parcel.id, date, crop: crop ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      let st: AnalysisStatus;
      do {
        await new Promise((r) => setTimeout(r, 300));
        if (cancelled.current) return;
        const r = await fetch(`/api/analysis/${data.id}`, { cache: "no-store" });
        st = await r.json();
        setStatus(st);
      } while (!st.done);
      // Fetch the report JSON once: it fills "Twoje gospodarstwo" and warms the offline cache.
      const rep = await fetch(`/api/report?${st.reportUrl.split("?")[1]}`);
      if (rep.ok) saveToFarm((await rep.json()) as Report, st.reportUrl);
      router.push(st.reportUrl);
    } catch (e) {
      setError((e as Error).message || "Nie udało się uruchomić analizy. Sprawdź połączenie i spróbuj ponownie.");
      setRunning(false);
    }
  }

  function addToFarm() {
    if (!parcel) return;
    const q = new URLSearchParams({ dzialka: parcel.id, data: date });
    if (crop) q.set("uprawa", crop);
    upsert({
      parcelId: parcel.id,
      name: `${parcel.number} · ${crop ?? parcel.detectedCrop}`,
      meta: `${parcel.areaHa.toLocaleString("pl-PL")} ha · jeszcze nie sprawdzona`,
      status: "Nowa",
      tone: "warn",
      url: `/raport?${q}`,
      checkedAt: "",
    });
  }

  return (
    <div className="min-h-screen bg-bg pb-24 text-ink md:pb-0">
      <header className="border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-[1376px] flex-wrap items-center gap-4 px-8 py-3.5 max-sm:px-4">
          <div className="flex items-center gap-2.5">
            <Logo />
            <div className="flex flex-col">
              <span className="text-[17px] font-extrabold tracking-tight">Asystent Wodny</span>
              <span className="text-xs text-muted">woda na Twojej działce — z danych publicznych</span>
            </div>
          </div>
          <nav className="ml-auto flex flex-wrap items-center gap-2 max-sm:hidden">
            <a href="#jak" className="rounded-[10px] px-3.5 py-2.5 text-sm font-medium text-ink-2 no-underline">
              Jak to działa
            </a>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-tint-2 px-3 py-2 text-xs font-semibold text-primary">
              <Icon d={ICON.lock} size={14} />
              Bez logowania · bez danych osobowych
            </span>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1376px] flex-wrap items-start gap-6 px-8 pb-12 pt-8 max-sm:gap-4 max-sm:px-4 max-sm:pt-4">
        <Card className="flex min-w-0 flex-[999_1_560px] flex-col gap-7 p-8 max-sm:gap-6 max-sm:p-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[32px] font-extrabold leading-tight tracking-tight max-sm:text-[26px]">
              Sprawdź wodę na swojej działce
            </h1>
            <p className="text-base text-ink-3">Podaj działkę i dzień. Uprawę, glebę, teren i pogodę z 10 lat pobierzemy sami.</p>
          </div>

          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5">
              <StepNumber n={1} />
              <h2 className="text-[19px] font-bold">Wskaż działkę</h2>
            </div>
            <ParcelPicker initialId={initialParcelId} parcel={parcel} onParcel={onParcel} crop={crop} onCrop={setCrop} />
          </div>

          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5">
              <StepNumber n={2} />
              <h2 className="text-[19px] font-bold">Na jaki dzień?</h2>
            </div>
            <DatePicker value={date} today={today} onChange={setDate} />
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t border-rule-soft pt-4">
            <button
              onClick={start}
              disabled={!parcel || running}
              className="inline-flex min-h-14 items-center gap-2.5 rounded-[14px] bg-primary px-7 text-lg font-bold text-white hover:bg-primary-dark disabled:opacity-50 max-sm:w-full max-sm:justify-center"
            >
              {running ? "Analizuję…" : "Sprawdź działkę"}
              <Icon d={ICON.arrowRight} size={20} stroke={2.5} />
            </button>
            <span className="max-w-[440px] text-[13px] text-muted">
              Tylko publiczne, bezpłatne dane: GUGiK, ARiMR, IUNG-PIB, Copernicus, USGS Landsat, Open-Meteo, IMGW-PIB, Wody Polskie.
            </span>
          </div>
        </Card>

        <aside className="flex min-w-0 flex-[1_1_380px] flex-col gap-6 max-sm:gap-4">
          <div ref={progressRef} className={running || status || error ? "scroll-mt-4" : "max-md:hidden"}>
            <ProgressPanel status={status} error={error} />
          </div>
          <FarmPanel farm={farm} onAdd={addToFarm} canAdd={!!parcel} />
          <Card className="flex flex-col gap-2 p-6 text-sm text-ink-3 max-sm:p-4">
            <h2 id="jak" className="scroll-mt-4 text-[17px] font-bold text-ink">
              Jak to działa
            </h2>
            <p>
              Łączymy bezpłatne dane publiczne: granice działki (GUGiK), uprawy (ARiMR), pogodę z 10 lat (ERA5-Land), glebę (IUNG-PIB),
              rzeźbę terenu (NMT) i zdjęcia satelitarne. Liczymy bilans wody w glebie i porównujemy go z progami suszy IUNG.
            </p>
            <p>W raporcie zobaczysz na mapie, co zrobić i gdzie: najpierw zatrzymanie wody, potem zabiegi na polu, na końcu nawadnianie.</p>
          </Card>
        </aside>
      </main>

      <MobileNav active="dzialki" reportHref={farm[0]?.url ?? null} />
    </div>
  );
}
