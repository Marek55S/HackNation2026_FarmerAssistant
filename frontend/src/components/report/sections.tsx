"use client";

import type { Action, ActionCategory, ActionId, CauseLevel, DroughtTag, MapLayer, Report } from "@/lib/types";
import { Card, ICON, Icon } from "../ui";
import { CAT, LAYERS } from "./parcel-map";

export function ActionList({ actions, pin, onPick }: { actions: Action[]; pin: ActionId; onPick: (a: Action) => void }) {
  const groups: ActionCategory[] = ["ret", "agro", "irr"];
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-xl font-extrabold">Co zrobić i gdzie</h2>
        <span className="text-[13px] text-muted">numery jak na mapie</span>
      </div>
      {groups.map((g) => (
        <div key={g} className="flex flex-col gap-2">
          <span className="text-xs font-extrabold uppercase tracking-[0.06em]" style={{ color: CAT[g].color }}>
            {CAT[g].name}
          </span>
          {actions
            .filter((a) => a.cat === g)
            .map((a) => {
              const sel = pin === a.id;
              return (
                <div
                  key={a.id}
                  className={`print-break-avoid overflow-hidden rounded-[14px] ${sel ? "border-2 border-ink" : "border border-rule bg-paper"}`}
                  style={sel ? { background: CAT[a.cat].bg } : undefined}
                >
                  <button
                    onClick={() => onPick(a)}
                    aria-expanded={sel}
                    className="flex w-full items-start gap-3 border-0 bg-transparent px-3.5 py-3 text-left text-ink"
                  >
                    <span
                      className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-[15px] font-extrabold text-white"
                      style={{ background: CAT[a.cat].color }}
                    >
                      {a.n}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                      <span className="text-base font-extrabold">{a.title}</span>
                      <span className="text-[13px] text-[#26281F]">
                        <b className="font-semibold">Gdzie:</b> {a.where}
                      </span>
                      <span className="text-[13px] text-[#26281F]">
                        <b className="font-semibold">Kiedy:</b> {a.when}
                      </span>
                      <span className="mt-0.5 self-start rounded-full bg-[#FBEDE4] px-2.5 py-[3px] text-xs font-semibold text-[#6B2A0E]">
                        bo {a.cause}
                      </span>
                      <span className="inline-flex items-start gap-1.5 text-[13px] font-semibold text-[#145C14]">
                        <Icon d={ICON.trend} size={14} stroke={2.6} className="mt-0.5" />
                        Co zyskasz: {a.gain}
                      </span>
                    </span>
                  </button>
                  {sel && (
                    <div className="flex flex-col gap-2 pb-3.5 pl-[58px] pr-3.5 max-sm:pl-3.5">
                      <span className="text-sm leading-relaxed text-[#26281F]">{a.why}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {a.chips.map((c) => (
                          <span key={c} className="rounded-full border border-rule-strong bg-paper px-2.5 py-1 text-xs font-semibold">
                            {c}
                          </span>
                        ))}
                      </div>
                      <span className="no-print text-xs text-muted">Na mapie: widok „{LAYERS[a.layer]}” — tam widać przyczynę.</span>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}

const LVL: Record<CauseLevel, string> = {
  główna: "bg-[#a8401a] text-white",
  duża: "bg-[#f6b48c] text-[#4A200C]",
  mała: "bg-[#F1EFE8] text-ink-2",
};

export function Causes({ report, onShow }: { report: Report; onShow: (l: MapLayer) => void }) {
  return (
    <Card className="print-break-avoid flex min-w-0 flex-[999_1_560px] flex-col gap-3 p-5 max-sm:p-4">
      <h2 className="text-lg font-extrabold">Co zwiększa ryzyko na tej działce</h2>
      {report.causes.map((c) => (
        <div key={c.name} className="flex flex-wrap items-center gap-3 border-t border-chip py-2.5">
          <span
            className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full"
            style={{ background: c.color, color: c.icon === "sand" ? "#1A1C19" : "#FFFFFF" }}
          >
            <Icon d={ICON[c.icon]} size={20} />
          </span>
          <span className="flex min-w-[200px] flex-1 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-bold">{c.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${LVL[c.level]}`}>{c.level}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c.layer ? "bg-primary-tint-2 text-[#145C14]" : "bg-[#ECEFF3] text-[#3A4250]"}`}
              >
                {c.layer ? "da się zmienić" : "pogoda"}
              </span>
            </span>
            <span className="text-[13px] text-ink-3">{c.evidence}</span>
          </span>
          {c.layer && (
            <button
              onClick={() => onShow(c.layer!)}
              className="no-print min-h-10 rounded-[10px] border border-rule-strong bg-paper px-3 text-[13px] font-semibold text-primary"
            >
              Pokaż na mapie
            </button>
          )}
        </div>
      ))}
    </Card>
  );
}

const riskColor = (n: number) =>
  n >= 7 ? "bg-[#a8401a] text-white" : n >= 4 ? "bg-[#e9784a] text-[#2A1206]" : n >= 2 ? "bg-[#f6b48c] text-[#4A200C]" : "bg-[#F1EFE8] text-ink-2";

const TAG: Record<DroughtTag, string> = {
  skrajna: "bg-[#a8401a] text-white",
  silna: "bg-[#e9784a] text-[#2A1206]",
  "umiark.": "bg-[#f6b48c] text-[#4A200C]",
  lekka: "bg-[#fde4d6] text-[#5A2A12]",
  brak: "bg-[#F1EFE8] text-ink-2",
};

export function Risk({ report }: { report: Report }) {
  const { risk } = report;
  const row = (label: string, values: number[]) => (
    <>
      <span className="whitespace-nowrap pr-1.5 text-xs font-semibold text-ink-2">{label}</span>
      {values.map((n, i) => (
        <span key={i} className={`tabular rounded-md px-0.5 py-2 text-center text-[13px] font-bold max-sm:text-[11px] ${riskColor(n)}`}>
          {n}/10
        </span>
      ))}
    </>
  );
  return (
    <Card className="print-break-avoid flex min-w-0 flex-[1_1_380px] flex-col gap-3 p-5 max-sm:p-4">
      <h2 className="text-lg font-extrabold">{risk.head}</h2>
      <span className="text-[15px] font-semibold leading-snug">{risk.say}</span>
      <div className="grid grid-cols-[auto_repeat(6,minmax(0,1fr))] items-center gap-1">
        <span />
        {risk.cols.map((c) => (
          <span key={c} className="text-center text-[11px] text-muted max-sm:text-[10px]">
            {c}
          </span>
        ))}
        {row("bez działań", risk.noAction)}
        {row("z planem", risk.withPlan)}
      </div>
      <span className="text-xs text-muted">{risk.note}</span>
      <details className="border-t border-rule-soft pt-2 text-[13px] text-ink-2" open>
        <summary className="min-h-7 font-semibold text-primary">Na czym to opieramy: 10 ostatnich sezonów</summary>
        <div className="flex flex-col gap-2 pt-2">
          <div className="grid grid-cols-5 gap-1.5">
            {report.history.map((h) => (
              <span
                key={h.year}
                title={`${h.crop} — ${h.tag === "brak" ? "bez suszy" : `susza: ${h.tag}`}`}
                className={`flex flex-col items-center gap-px rounded-lg px-1 py-1.5 ${TAG[h.tag]}`}
              >
                <b className="text-[13px]">{h.year}</b>
                <span className="text-center text-[11px] leading-tight">{h.crop}</span>
                <span className="text-[11px] font-bold">{h.tag}</span>
              </span>
            ))}
          </div>
          <span className="text-xs text-muted">{report.historyNote}</span>
        </div>
      </details>
    </Card>
  );
}

export function Sources({ report }: { report: Report }) {
  const cls = { ok: "bg-primary-tint-2 text-primary", current: "bg-[#FDF1DC] text-[#6A4300]", missing: "bg-[#FBE3E3] text-[#6E1717]" };
  return (
    <Card className="print-break-avoid flex flex-col gap-3 p-5 max-sm:p-4">
      <h2 className="text-lg font-extrabold">Skąd wiemy</h2>
      <div className="flex flex-wrap gap-2">
        {report.sources.map((s) => (
          <span key={s.label} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-semibold ${cls[s.state]}`}>
            {s.state === "ok" && <Icon d={ICON.check} size={14} stroke={3} />}
            {s.state === "missing" && <Icon d={ICON.x} size={14} stroke={3} />}
            {s.label}
          </span>
        ))}
      </div>
      <details className="border-t border-rule-soft pt-2.5 print:hidden">
        <summary className="min-h-8 text-sm font-semibold text-primary">Szczegóły dla doradcy: liczby, metody, ograniczenia</summary>
        <AdvisorList items={report.advisorDetails} />
      </details>
      <div className="print-only border-t border-rule-soft pt-2.5">
        <h3 className="text-sm font-bold">Szczegóły dla doradcy</h3>
        <AdvisorList items={report.advisorDetails} />
      </div>
    </Card>
  );
}

function AdvisorList({ items }: { items: string[] }) {
  return (
    <ul className="mt-2.5 list-disc pl-[18px] text-[13px] leading-relaxed text-[#26281F]">
      {items.map((d) => (
        <li key={d}>{d}</li>
      ))}
    </ul>
  );
}
