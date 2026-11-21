import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ReportScreen } from "@/components/report/report-screen";
import { isValidIso, MIN_DATE, todayIso } from "@/lib/dates";
import { buildReport, reportTitle, reportUrl } from "@/lib/mock/report";

export const dynamic = "force-dynamic";

async function load(searchParams: PageProps<"/raport">["searchParams"]) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
  const today = todayIso();
  const raw = one(q.data);
  const date = isValidIso(raw) && raw >= MIN_DATE && raw <= today ? raw : today;
  const dzialka = one(q.dzialka);
  const uprawa = one(q.uprawa);
  const result = buildReport({ parcelId: dzialka, date, crop: uprawa, today });
  return { result, dzialka, date, url: reportUrl({ dzialka: dzialka ?? "", data: date, uprawa }) };
}

export async function generateMetadata({ searchParams }: PageProps<"/raport">): Promise<Metadata> {
  const { result } = await load(searchParams);
  return { title: "report" in result ? reportTitle(result.report) : "Raport" };
}

export default async function RaportPage({ searchParams }: PageProps<"/raport">) {
  const { result, dzialka, date, url } = await load(searchParams);
  if ("error" in result) {
    // No crop data for that year and none chosen → back to the start screen to pick one (pipeline_plan.md F0).
    if (result.error === "crop-required") redirect(`/?${new URLSearchParams({ dzialka: dzialka ?? "", data: date })}`);
    notFound();
  }
  return <ReportScreen report={result.report} url={url} />;
}
