import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportScreen } from "@/components/report/report-screen";
import { isValidIso, MIN_DATE, todayIso } from "@/lib/dates";
import { buildReport, reportTitle } from "@/lib/mock/report";

export const dynamic = "force-dynamic";

async function load(searchParams: PageProps<"/raport">["searchParams"]) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
  const today = todayIso();
  const raw = one(q.data);
  const date = isValidIso(raw) && raw >= MIN_DATE && raw <= today ? raw : today;
  const report = buildReport({ parcelId: one(q.dzialka), date, crop: one(q.uprawa) });
  const params = new URLSearchParams({ dzialka: report?.parcel.id ?? "", data: date });
  if (one(q.uprawa)) params.set("uprawa", one(q.uprawa)!);
  return { report, url: `/raport?${params}` };
}

export async function generateMetadata({ searchParams }: PageProps<"/raport">): Promise<Metadata> {
  const { report } = await load(searchParams);
  return { title: report ? reportTitle(report) : "Raport" };
}

export default async function RaportPage({ searchParams }: PageProps<"/raport">) {
  const { report, url } = await load(searchParams);
  if (!report) notFound();
  return <ReportScreen report={report} url={url} />;
}
