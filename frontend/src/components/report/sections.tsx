"use client";

import { shortDate } from "@/lib/dates";
import { useState } from "react";
import type {
  ActionCategory,
  CauseLevel,
  DroughtTag,
  MapLayer,
  Report,
  ReportPart,
  RuleId,
  Zalecenie,
} from "@/lib/types";
import { Card, ICON, Icon, SCALE, StatusPill } from "../ui";
import { CAT, LAYERS } from "./map-style";

const ha = (v: number) =>
  v.toLocaleString("pl-PL", { maximumFractionDigits: 2 });

/**
 * "Uprawy na tej działce": jedna karta na uprawę. Pogoda, gleba, teren i zlewnia są wspólne dla działki,
 * więc różnią się tylko te liczby, które zależą od rośliny — zapas wody i próg stresu.
 */
export function CropParts({
  report,
  onPick,
}: {
  report: Report;
  onPick: (n: number) => void;
}) {
  if (report.parts.length < 2) return null;
  return (
    <section className="flex flex-col gap-3" aria-label="Uprawy na tej działce">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h2 className="text-xl font-extrabold">Uprawy na tej działce</h2>
        <span className="text-[13px] text-muted">
          {report.parts.length} części · woda, gleba i teren są wspólne,
          zalecenia polowe liczymy osobno dla każdej uprawy
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {report.parts.map((p) => (
          <CropPartCard
            key={p.id}
            part={p}
            actions={report.actions.filter((a) => a.czesc === p.id)}
            onPick={onPick}
          />
        ))}
      </div>
    </section>
  );
}

function CropPartCard({
  part,
  actions,
  onPick,
}: {
  part: ReportPart;
  actions: Zalecenie[];
  onPick: (n: number) => void;
}) {
  return (
    <article className="print-break-avoid flex flex-col gap-3 rounded-[var(--r-card)] border border-rule bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-[17px] font-bold leading-snug">
            {part.crop?.id === "brak" ? "Brak uprawy" : (part.crop?.name ?? "Bez wskazanej uprawy")}
          </h3>
          <span className="text-[13px] text-muted">
            {ha(part.areaHa)} ha · {part.sharePct}% działki
          </span>
        </div>
        <StatusPill tone={part.status.tone} label={part.status.label} small />
      </div>
      <p className="text-[13px] leading-snug text-ink-2">{part.headline}</p>
      {part.soilWaterPct !== null && part.stressThresholdPct !== null && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="text-muted">Woda w glebie</span>
            <span className="tabular font-semibold">
              {part.soilWaterPct}%{" "}
              <span className="font-normal text-muted">
                · próg {part.stressThresholdPct}%
              </span>
            </span>
          </div>
          <div
            className="relative h-1.5 rounded-full bg-chip"
            aria-hidden="true"
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-[#2a78d6]"
              style={{ width: `${part.soilWaterPct}%` }}
            />
            <span
              className="absolute -top-1 bottom-[-4px] w-0.5 bg-ink"
              style={{ left: `${part.stressThresholdPct}%` }}
            />
          </div>
        </div>
      )}
      <p className="text-xs text-muted">
        {part.manual ? "dodane przez Ciebie" : part.cropSplitSource}
      </p>
      {actions.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {actions.map((a) => (
            <button
              key={a.n}
              onClick={() => onPick(a.n)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-rule-strong px-2.5 py-1 text-left text-[13px] font-semibold text-ink hover:border-heading"
            >
              <span
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white"
                style={{ background: CAT[a.kategoria].color }}
              >
                {a.n}
              </span>
              {a.co}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

const RULE_ICON: Partial<Record<RuleId, string>> = {
  R1: ICON.gate,
  R2: ICON.pond,
  R3: ICON.trees,
  R5: ICON.sprout,
  R7: ICON.watering,
  R8: ICON.watering,
};

/**
 * "Co zrobić i gdzie": compact cards (icon, title, when) that expand for the details.
 * Clicking a card selects it on the map and opens it; clicking the open card again closes it.
 */
export function ActionList({
  actions,
  parts,
  pin,
  onPick,
}: {
  actions: Zalecenie[];
  parts: ReportPart[];
  pin: number;
  onPick: (a: Zalecenie) => void;
}) {
  // The selected card is open unless the user closed it; selecting another card (or a map pin) opens that one.
  const [closedFor, setClosedFor] = useState<number | null>(null);
  const kategorie: ActionCategory[] = ["ret", "agro", "irr"];
  // Retencja dotyczy całej działki (gleba, teren, zlewnia), reszta zaleceń należy do konkretnej uprawy.
  const wiele = parts.length > 1;
  const sekcje: { key: string; naglowek: string | null; items: Zalecenie[] }[] =
    wiele
      ? [
          {
            key: "dzialka",
            naglowek: "Cała działka",
            items: actions.filter((a) => a.czesc === null),
          },
          ...parts.map((p) => ({
            key: p.id,
            naglowek: `${p.crop?.name ?? "Bez uprawy"} · ${ha(p.areaHa)} ha`,
            items: actions.filter((a) => a.czesc === p.id),
          })),
        ]
      : [{ key: "all", naglowek: null, items: actions }];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-xl font-bold">Co zrobić i gdzie</h2>
        <span className="text-[13px] text-muted">numery jak na mapie</span>
      </div>
      {sekcje.map((s) =>
        s.items.length === 0 ? null : (
          <section key={s.key} className="flex flex-col gap-4">
            {s.naglowek && (
              <h3 className="border-b border-rule-strong pb-1.5 text-[17px] font-extrabold text-heading">
                {s.naglowek}
              </h3>
            )}
            {kategorie.map((g) => {
              const items = s.items.filter((a) => a.kategoria === g);
              if (items.length === 0) return null;
              return (
                <div key={g} className="flex flex-col gap-2">
                  <h4
                    className="text-xs font-bold uppercase tracking-[0.06em]"
                    style={{ color: CAT[g].ink }}
                  >
                    {CAT[g].name.replace(/^\d · /, "")}
                  </h4>
                  {items.map((a) => {
                    const selected = pin === a.n;
                    const open = selected && closedFor !== a.n;
                    return (
                      <div
                        key={a.n}
                        className={`print-break-avoid overflow-hidden rounded-[18px] border bg-paper transition-[border-color,box-shadow] duration-150 ${
                          selected
                            ? "border-heading shadow-[0_0_0_1px_var(--heading)]"
                            : "border-rule hover:border-rule-strong"
                        }`}
                      >
                        <button
                          onClick={() => {
                            if (selected) setClosedFor(open ? a.n : null);
                            else {
                              setClosedFor(null);
                              onPick(a);
                            }
                          }}
                          aria-expanded={open}
                          className="flex w-full items-center gap-3.5 px-3.5 py-3 text-left"
                        >
                          <span className="relative flex-none">
                            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-chip text-heading">
                              <Icon
                                d={RULE_ICON[a.regula] ?? ICON.check}
                                size={24}
                                stroke={1.6}
                              />
                            </span>
                            <span
                              className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-paper px-1 text-[11px] font-bold text-white"
                              style={{ background: CAT[a.kategoria].color }}
                            >
                              {a.n}
                            </span>
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="text-[15px] font-semibold leading-snug text-ink">
                              {a.co}
                            </span>
                            <span
                              className={`text-[13px] text-muted ${open ? "" : "truncate"}`}
                            >
                              {a.kiedy}
                            </span>
                          </span>
                          <Icon
                            d={ICON.chevronDown}
                            size={18}
                            className={`text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                          />
                        </button>
                        {open && (
                          <div className="flex flex-col gap-3 border-t border-rule-soft px-3.5 pb-4 pt-3 text-[13px]">
                            {a.kroki?.length > 0 && (
                              <div className="flex flex-col gap-1.5">
                                <h4 className="text-xs font-bold uppercase tracking-[0.06em] text-heading">
                                  Co zrobić
                                </h4>
                                <ol className="flex flex-col gap-1.5">
                                  {a.kroki.map((k, i) => (
                                    <li
                                      key={i}
                                      className="flex items-start gap-2.5 text-ink"
                                    >
                                      <span className="mt-px inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-chip text-[11px] font-bold text-heading">
                                        {i + 1}
                                      </span>
                                      <span className="leading-snug">{k}</span>
                                    </li>
                                  ))}
                                </ol>
                              </div>
                            )}
                            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                              <dt className="text-muted">Gdzie</dt>
                              <dd className="text-ink">{a.gdzie}</dd>
                              {a.ile && (
                                <>
                                  <dt className="text-muted">Ile</dt>
                                  <dd className="text-ink">{a.ile}</dd>
                                </>
                              )}
                              <dt className="text-muted">Dlaczego</dt>
                              <dd className="text-ink">{a.bo.join("; ")}</dd>
                            </dl>
                            <p className="flex items-start gap-2 rounded-xl bg-primary-tint px-3 py-2 text-ink">
                              <Icon
                                d={ICON.trend}
                                size={16}
                                stroke={2}
                                className="mt-0.5 text-heading"
                              />
                              <span>
                                <span className="font-semibold text-heading">
                                  Co zyskasz:{" "}
                                </span>
                                {a.co_zyskasz}
                              </span>
                            </p>
                            <p className="leading-relaxed text-ink-2">
                              {a.dlaczego}
                            </p>
                            {a.tagi.length > 0 && (
                              <p className="text-muted">{a.tagi.join(" · ")}</p>
                            )}
                            <p className="text-xs text-muted">
                              Reguła {a.regula} · na podstawie:{" "}
                              {a.fakty.join(", ")}
                              <span className="no-print">
                                {" "}
                                · na mapie: {LAYERS[a.warstwa].toLowerCase()}
                              </span>
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </section>
        ),
      )}
    </div>
  );
}

/** Cause weight as a quiet 3-step meter (like signal bars) instead of coloured pills. */
const WEIGHT: Record<CauseLevel, { n: number; label: string }> = {
  główna: { n: 3, label: "główny wpływ" },
  duża: { n: 2, label: "duży wpływ" },
  mała: { n: 1, label: "mały wpływ" },
};

function WeightMeter({ level }: { level: CauseLevel }) {
  const w = WEIGHT[level];
  return (
    <span
      className="inline-flex items-center gap-2 text-xs text-muted"
      title={w.label}
    >
      <span
        className="inline-flex h-3.5 items-end gap-[3px]"
        aria-hidden="true"
      >
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={`w-[5px] rounded-[2px] ${i <= w.n ? "bg-heading" : "bg-rule-strong"}`}
            style={{ height: 4 + i * 3.5 }}
          />
        ))}
      </span>
      <span className="whitespace-nowrap">{w.label}</span>
    </span>
  );
}

const ORDER: Record<CauseLevel, number> = { główna: 0, duża: 1, mała: 2 };

export function Causes({
  report,
  onShow,
}: {
  report: Report;
  onShow: (l: MapLayer) => void;
}) {
  const byWeight = [...report.causes].sort(
    (a, b) => ORDER[a.level] - ORDER[b.level],
  );
  const groups = [
    {
      title: "Pogoda",
      note: "na to nie masz wpływu",
      items: byWeight.filter((c) => !c.layer),
    },
    {
      title: "Cechy działki",
      note: "na to można wpłynąć — zobacz zalecenia",
      items: byWeight.filter((c) => c.layer),
    },
  ].filter((g) => g.items.length > 0);
  return (
    <Card className="print-break-avoid flex min-w-0 flex-[999_1_560px] flex-col gap-5 p-6 max-sm:p-4">
      <h2 className="text-xl font-bold">Co zwiększa ryzyko na tej działce</h2>
      {groups.map((g) => (
        <div key={g.title} className="flex flex-col">
          <h3 className="flex flex-wrap items-baseline gap-x-2 pb-1 text-xs font-bold uppercase tracking-[0.06em] text-heading">
            {g.title}
            <span className="text-[11px] font-medium normal-case tracking-normal text-muted">
              {g.note}
            </span>
          </h3>
          <ul className="flex flex-col">
            {g.items.map((c) => (
              <li
                key={c.id}
                className="flex items-start gap-3.5 border-t border-rule-soft py-3 first:border-t-0"
              >
                <span className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-chip text-heading">
                  <Icon d={ICON[c.icon]} size={24} stroke={1.6} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <span className="text-[15px] font-semibold text-ink">
                      {c.name}
                    </span>
                    <WeightMeter level={c.level} />
                  </span>
                  <span className="text-[13px] leading-snug text-ink-3">
                    {c.evidence}
                  </span>
                  {c.layer && (
                    <button
                      onClick={() => onShow(c.layer!)}
                      className="no-print mt-0.5 inline-flex items-center gap-1.5 self-start rounded-full py-1 text-[13px] font-semibold text-heading hover:underline"
                    >
                      <Icon d={ICON.map} size={15} stroke={1.75} />
                      Pokaż na mapie: {LAYERS[c.layer].toLowerCase()}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  );
}

const riskClass = (n: number, total: number) => {
  const share = n / total;
  return SCALE[share >= 0.7 ? 4 : share >= 0.4 ? 3 : share >= 0.2 ? 2 : 0];
};

const TAG: Record<DroughtTag, string> = {
  skrajna: SCALE[4],
  silna: SCALE[3],
  "umiark.": SCALE[2],
  lekka: SCALE[1],
  brak: SCALE[0],
};

export function Risk({ report }: { report: Report }) {
  const { risk, scenarios: N } = report;
  if (!risk) return null;
  const row = (label: string, values: number[]) => (
    <tr>
      <th
        scope="row"
        className="whitespace-nowrap pr-1.5 text-left text-xs font-semibold text-ink-2"
      >
        {label}
      </th>
      {values.map((n, i) => (
        <td
          key={i}
          className={`tabular rounded-md px-0.5 py-2 text-center text-[13px] font-bold max-sm:text-[11px] ${riskClass(n, N)}`}
        >
          {n}/{N}
        </td>
      ))}
    </tr>
  );
  return (
    <Card className="print-break-avoid flex min-w-0 flex-[1_1_380px] flex-col gap-3 p-5 max-sm:p-4">
      <h2 className="text-lg font-extrabold">{risk.head}</h2>
      {/* First sentence = the risk without action (bold); the rest explains what the plan changes. */}
      <p className="text-[15px] leading-snug">
        {(() => {
          const [lead, ...rest] = risk.say.split(/(?<=\.)\s+(?=[A-ZŻŹĆŁŚÓ])/);
          return (
            <>
              <span className="font-semibold">{lead}</span>
              {rest.length > 0 && (
                <span className="text-ink-2"> {rest.join(" ")}</span>
              )}
            </>
          );
        })()}
      </p>
      <table className="w-full table-fixed border-separate border-spacing-1">
        <caption className="sr-only">
          W ilu z {N} scenariuszy uprawa będzie w stresie wodnym: bez działań i
          z planem
        </caption>
        <colgroup>
          <col className="w-[84px] max-sm:w-[70px]" />
        </colgroup>
        <thead>
          <tr>
            <td />
            {risk.cols.map((c) => (
              <th
                key={c}
                scope="col"
                className="text-center text-[11px] font-normal text-muted max-sm:text-[10px]"
              >
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

/**
 * 10-year vulnerability (task 3.3 pt 4), shown right after the state on day D (TODO_LUKI L4):
 * how often the parcel ran short of water, season by season, each judged for the crop grown that year.
 */
export function Vulnerability({ report }: { report: Report }) {
  const v = report.vulnerability;
  const history = report.justification?.history ?? [];
  if (!v || history.length === 0) return null;
  const assumed = history.filter((h) => h.cropKnown === false).length;
  return (
    <Card className="print-break-avoid flex min-w-0 flex-[1_1_380px] flex-col gap-3 p-5 max-sm:p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold">Jak często brakowało wody</h2>
        <p className="text-[13px] text-ink-3">
          {report.yearsLabel && `${report.yearsLabel} · `}każdy sezon oceniony
          dla uprawy, która wtedy rosła
        </p>
      </div>
      <ul
        className="grid grid-cols-5 gap-1.5"
        aria-label={`Susza w ${v.drought} z ${v.seasons} sezonów`}
      >
        {history.map((h) => (
          <li
            key={h.year}
            title={
              h.note ||
              `${h.crop} — ${h.tag === "brak" ? "bez suszy" : `susza: ${h.tag}`}`
            }
            className={`flex flex-col items-center gap-px rounded-lg px-1 py-1.5 ${TAG[h.tag]}`}
          >
            <b className="text-[13px]">{h.year}</b>
            <span className="text-center text-[11px] leading-tight">
              {h.crop}
              {h.cropKnown === false && (
                <span aria-label="uprawa przyjęta">*</span>
              )}
            </span>
            <span className="text-center text-[11px] font-bold leading-tight">
              {h.tag === "brak" ? "bez suszy" : h.tag}
            </span>
          </li>
        ))}
      </ul>
      <span className="text-xs text-muted">
        {report.justification?.historyNote}
        {assumed > 0 &&
          ` * w ${assumed} ${assumed === 1 ? "sezonie" : "sezonach"} nie wiemy, co rosło — przyjęto bieżącą uprawę.`}
      </span>
    </Card>
  );
}

/** Collapsed justification (pipeline_plan.md §8 pt 7): IUNG criterion on day D. The 10-year history is in Vulnerability. */
export function Justification({ report }: { report: Report }) {
  const j = report.justification;
  if (!j) return null;
  return (
    <Card className="print-break-avoid p-5 max-sm:p-4">
      <details className="group">
        <summary className="flex min-h-8 list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
          <Icon
            d={ICON.chevronRight}
            size={18}
            className="text-heading transition-transform duration-200 group-open:rotate-90"
          />
          <h2 className="text-xl font-bold">
            Uzasadnienie: kryterium suszy IUNG w dniu analizy
          </h2>
        </summary>
        <div className="flex flex-col gap-3 pt-3 text-[13px] text-ink-2">
          <p className="text-sm text-ink">{j.iungNow}</p>
          <span className="text-xs text-muted">
            Próg suszy rolniczej IUNG‑PIB (Rozporządzenie MRiRW 2019) dla uprawy
            i kategorii gleby. Liczby i metody: „Skąd wiemy” → „Szczegóły dla
            doradcy”.
          </span>
        </div>
      </details>
    </Card>
  );
}

export function Sources({ report }: { report: Report }) {
  const fetched = report.sources.find((x) => x.fetchedAt)?.fetchedAt;
  return (
    <Card className="print-break-avoid flex flex-col gap-5 p-6 max-sm:p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-xl font-bold">Skąd wiemy</h2>
        <span className="text-[13px] text-muted">
          {report.sources.length} źródeł danych publicznych
          {fetched && ` · pobrane ${shortDate(fetched)}`}
        </span>
      </div>

      {/* Plain two-column list: what · where from. Caveats only where something is off — no badges. */}
      <dl className="grid gap-x-12 md:grid-cols-2">
        {report.sources.map((x, i) => (
          <div
            key={`${x.id}-${i}`}
            className="flex items-baseline justify-between gap-4 border-t border-rule-soft py-2.5 text-[13px]"
          >
            <dt className="font-medium text-ink">{x.what}</dt>
            <dd className="flex flex-col items-end text-right">
              <span className={x.source ? "text-ink-2" : "text-muted"}>
                {x.source ?? "brak danych"}
              </span>
              {x.note && (
                <span
                  className={`text-xs ${x.state === "missing" ? "text-danger-ink" : "text-muted"}`}
                >
                  {x.note}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {report.notChecked.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="pb-1 text-xs font-bold uppercase tracking-[0.06em] text-heading">
            Czego nie sprawdziliśmy
          </h3>
          <ul className="flex flex-col">
            {report.notChecked.map((n) => (
              <li
                key={n.what}
                className="flex items-baseline justify-between gap-4 border-t border-rule-soft py-2.5 text-[13px]"
              >
                <span className="font-medium text-ink">{n.what}</span>
                <span className="text-right text-muted">{n.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.advisorDetails.length > 0 && (
        <details className="group border-t border-rule-soft pt-3">
          <summary className="flex min-h-8 list-none items-center gap-1.5 text-sm font-semibold text-heading [&::-webkit-details-marker]:hidden">
            <Icon
              d={ICON.chevronRight}
              size={15}
              className="transition-transform duration-200 group-open:rotate-90"
            />
            Szczegóły dla doradcy: liczby, metody, ograniczenia
          </summary>
          <ul className="mt-2.5 list-disc pl-[18px] text-[13px] leading-relaxed text-ink-2">
            {report.advisorDetails.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

/** Summary of the chosen period (from–to); shown only when the farmer picked a range. */
export function PeriodSummaryCard({ report }: { report: Report }) {
  const p = report.period;
  if (!p) return null;
  const fmt = (n: number) => n.toLocaleString("pl-PL");
  const diff = (a: number, b: number) =>
    `${a >= b ? "+" : "−"}${fmt(Math.abs(a - b))} mm wobec normy`;
  const stats: { label: string; value: string; note: string }[] = [
    {
      label: "Opad",
      value: `${fmt(p.rainMm)} mm`,
      note: diff(p.rainMm, p.rainNormMm),
    },
    {
      label: "Parowanie (ET0)",
      value: `${fmt(p.et0Mm)} mm`,
      note: diff(p.et0Mm, p.et0NormMm),
    },
    {
      label: "Bilans wody",
      value: `${p.kbwMm < 0 ? "−" : "+"}${fmt(Math.abs(p.kbwMm))} mm`,
      note: "opad minus parowanie",
    },
    {
      label: "Dni stresu uprawy",
      value: p.seasonDays > 0 ? `${p.stressDays} z ${p.seasonDays}` : "—",
      note:
        p.seasonDays > 0
          ? `najniższy zapas wody ${p.minSoilPct}%`
          : "okres poza sezonem",
    },
  ];
  return (
    <Card className="print-break-avoid flex flex-col gap-3.5 p-5 max-sm:p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-extrabold">Podsumowanie okresu</h2>
        <span className="text-[13px] text-muted">
          {shortDate(p.from)} – {shortDate(p.to)} · {p.days} dni
        </span>
      </div>
      <p className="text-[15px] font-semibold leading-snug">{p.say}</p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col gap-0.5 border-l-2 border-rule pl-3"
          >
            <dt className="text-xs font-semibold text-muted">{s.label}</dt>
            <dd className="tabular text-xl font-extrabold">{s.value}</dd>
            <dd className="text-xs text-ink-3">{s.note}</dd>
          </div>
        ))}
      </dl>
      <span className="text-xs text-muted">
        {p.iungDrought === null
          ? "Kryterium suszy IUNG dotyczy sezonu 21.III–30.IX — ten okres jest poza nim."
          : p.iungDrought
            ? "W tym okresie spełnione było kryterium suszy rolniczej IUNG."
            : "W tym okresie nie było spełnione kryterium suszy rolniczej IUNG."}{" "}
        Norma: ten sam okres w 10 poprzednich latach (ERA5-Land). Zalecenia
        niżej dotyczą dnia {shortDate(p.to)}.
      </span>
    </Card>
  );
}
