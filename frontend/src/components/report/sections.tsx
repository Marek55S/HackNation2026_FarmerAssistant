"use client";

import { shortDate } from "@/lib/dates";
import type { ActionCategory, CauseLevel, DroughtTag, MapLayer, Report, Zalecenie } from "@/lib/types";
import { Card, ICON, Icon, SCALE } from "../ui";
import { CAT, LAYERS } from "./parcel-map";

export function ActionList({ actions, pin, onPick }: { actions: Zalecenie[]; pin: number; onPick: (a: Zalecenie) => void }) {
  const groups: ActionCategory[] = ["ret", "agro", "irr"];
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-xl font-extrabold">Co zrobić i gdzie</h2>
        <span className="text-[13px] text-muted">numery jak na mapie</span>
      </div>
      {groups.map((g) => {
        const items = actions.filter((a) => a.kategoria === g);
        if (items.length === 0) return null;
        return (
          <div key={g} className="flex flex-col gap-2">
            <h3 className="text-xs font-extrabold uppercase tracking-[0.06em]" style={{ color: CAT[g].color }}>
              {CAT[g].name}
            </h3>
            {items.map((a) => {
              const sel = pin === a.n;
              return (
                <div
                  key={a.n}
                  className={`print-break-avoid overflow-hidden rounded-[14px] ${sel ? "border-2 border-ink" : "border border-rule bg-paper"}`}
                  style={sel ? { background: CAT[a.kategoria].bg } : undefined}
                >
                  <button
                    onClick={() => onPick(a)}
                    aria-expanded={sel}
                    className="flex w-full items-start gap-3 border-0 bg-transparent px-3.5 py-3 text-left text-ink"
                  >
                    <span
                      className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-[15px] font-extrabold text-white"
                      style={{ background: CAT[a.kategoria].color }}
                    >
                      {a.n}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                      <span className="text-base font-extrabold">{a.co}</span>
                      <span className="text-[13px] text-ink">
                        <b className="font-semibold">Gdzie:</b> {a.gdzie}
                      </span>
                      <span className="text-[13px] text-ink">
                        <b className="font-semibold">Kiedy:</b> {a.kiedy}
                      </span>
                      {a.ile && (
                        <span className="text-[13px] text-ink">
                          <b className="font-semibold">Ile:</b> {a.ile}
                        </span>
                      )}
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {a.bo.map((b) => (
                          <span key={b} className="rounded-full bg-cause-tint px-2.5 py-[3px] text-xs font-semibold text-cause-ink">
                            bo {b}
                          </span>
                        ))}
                      </span>
                      <span className="inline-flex items-start gap-1.5 text-[13px] font-semibold text-ok-ink">
                        <Icon d={ICON.trend} size={14} stroke={2.6} className="mt-0.5" />
                        Co zyskasz: {a.co_zyskasz}
                      </span>
                    </span>
                  </button>
                  {sel && (
                    <div className="flex flex-col gap-2 pb-3.5 pl-[58px] pr-3.5 max-sm:pl-3.5">
                      <span className="text-sm leading-relaxed text-ink">{a.dlaczego}</span>
                      {a.tagi.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {a.tagi.map((c) => (
                            <span key={c} className="rounded-full border border-rule-strong bg-paper px-2.5 py-1 text-xs font-semibold">
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                      <span className="text-xs text-muted">
                        Reguła {a.regula} · na podstawie: {a.fakty.join(", ")}
                        <span className="no-print"> · na mapie: widok „{LAYERS[a.warstwa]}”</span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

const LVL: Record<CauseLevel, string> = { główna: SCALE[4], duża: SCALE[2], mała: SCALE[0] };

export function Causes({ report, onShow }: { report: Report; onShow: (l: MapLayer) => void }) {
  return (
    <Card className="print-break-avoid flex min-w-0 flex-[999_1_560px] flex-col gap-3 p-5 max-sm:p-4">
      <h2 className="text-lg font-extrabold">Co zwiększa ryzyko na tej działce</h2>
      <ul className="flex flex-col">
        {report.causes.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 border-t border-chip py-2.5">
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
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c.layer ? "bg-ok-tint text-ok-ink" : "bg-weather-tint text-weather-ink"}`}
                >
                  {c.layer ? "cecha działki — da się zmienić" : "pogoda"}
                </span>
              </span>
              <span className="text-[13px] text-ink-3">{c.evidence}</span>
            </span>
            {c.layer && (
              <button
                onClick={() => onShow(c.layer!)}
                className="no-print min-h-10 rounded-[10px] border border-rule-strong bg-paper px-3 text-[13px] font-semibold text-primary hover:border-primary"
              >
                Pokaż na mapie
              </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

const riskClass = (n: number, total: number) => {
  const share = n / total;
  return SCALE[share >= 0.7 ? 4 : share >= 0.4 ? 3 : share >= 0.2 ? 2 : 0];
};

const TAG: Record<DroughtTag, string> = { skrajna: SCALE[4], silna: SCALE[3], "umiark.": SCALE[2], lekka: SCALE[1], brak: SCALE[0] };

export function Risk({ report }: { report: Report }) {
  const { risk, scenarios: N } = report;
  if (!risk) return null;
  const row = (label: string, values: number[]) => (
    <tr>
      <th scope="row" className="whitespace-nowrap pr-1.5 text-left text-xs font-semibold text-ink-2">
        {label}
      </th>
      {values.map((n, i) => (
        <td key={i} className={`tabular rounded-md px-0.5 py-2 text-center text-[13px] font-bold max-sm:text-[11px] ${riskClass(n, N)}`}>
          {n}/{N}
        </td>
      ))}
    </tr>
  );
  return (
    <Card className="print-break-avoid flex min-w-0 flex-[1_1_380px] flex-col gap-3 p-5 max-sm:p-4">
      <h2 className="text-lg font-extrabold">{risk.head}</h2>
      <span className="text-[15px] font-semibold leading-snug">{risk.say}</span>
      <table className="w-full table-fixed border-separate border-spacing-1">
        <caption className="sr-only">W ilu z {N} scenariuszy uprawa będzie w stresie wodnym: bez działań i z planem</caption>
        <colgroup>
          <col className="w-[84px] max-sm:w-[70px]" />
        </colgroup>
        <thead>
          <tr>
            <td />
            {risk.cols.map((c) => (
              <th key={c} scope="col" className="text-center text-[11px] font-normal text-muted max-sm:text-[10px]">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row("bez działań", risk.noAction)}
          {row("z planem", risk.withPlan)}
        </tbody>
      </table>
      <span className="text-xs text-muted">{risk.note}</span>
    </Card>
  );
}

/** Collapsed justification (pipeline_plan.md §8 pt 7): IUNG criterion now + 10-year history. */
export function Justification({ report }: { report: Report }) {
  const j = report.justification;
  if (!j) return null;
  return (
    <Card className="print-break-avoid p-5 max-sm:p-4">
      <details>
        <summary className="min-h-8 text-base font-extrabold text-ink">
          Uzasadnienie: kryterium suszy IUNG i 10 ostatnich sezonów
        </summary>
        <div className="flex flex-col gap-3 pt-3 text-[13px] text-ink-2">
          <p className="text-sm text-ink">{j.iungNow}</p>
          <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
            {j.history.map((h) => (
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
          <span className="text-xs text-muted">{j.historyNote}</span>
        </div>
      </details>
    </Card>
  );
}

export function Sources({ report }: { report: Report }) {
  const cls = { ok: "bg-primary-tint-2 text-primary", current: "bg-amber-tint text-amber-ink", missing: "bg-danger-tint text-danger-ink" };
  const fetched = report.sources.find((s) => s.fetchedAt)?.fetchedAt;
  return (
    <Card className="print-break-avoid flex flex-col gap-3 p-5 max-sm:p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-extrabold">Skąd wiemy</h2>
        {fetched && <span className="text-xs text-muted">dane pobrane {shortDate(fetched)}</span>}
      </div>
      <ul className="flex flex-wrap gap-2">
        {report.sources.map((s, i) => (
          <li key={`${s.id}-${i}`} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-semibold ${cls[s.state]}`}>
            {s.state === "ok" && <Icon d={ICON.check} size={14} stroke={3} />}
            {s.state === "missing" && <Icon d={ICON.x} size={14} stroke={3} />}
            {s.label}
          </li>
        ))}
      </ul>

      {report.notChecked.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-rule-soft pt-3">
          <h3 className="text-sm font-bold">Czego nie sprawdziliśmy</h3>
          <ul className="flex flex-col gap-1 text-[13px] text-ink-2">
            {report.notChecked.map((n) => (
              <li key={n.what} className="flex gap-2">
                <Icon d={ICON.x} size={14} stroke={2.6} className="mt-0.5 text-danger-ink" />
                <span>
                  <b className="font-semibold text-ink">{n.what}</b> — {n.why}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.advisorDetails.length > 0 && (
        <details className="border-t border-rule-soft pt-2.5">
          <summary className="min-h-8 text-sm font-semibold text-primary">Szczegóły dla doradcy: liczby, metody, ograniczenia</summary>
          <ul className="mt-2.5 list-disc pl-[18px] text-[13px] leading-relaxed text-ink">
            {report.advisorDetails.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
