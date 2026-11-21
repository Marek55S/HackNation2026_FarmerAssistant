import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ReportScreen } from "@/components/report/report-screen";
import { BackendError, fetchReport, reportUrl } from "@/lib/backend";
import { isValidIso, MIN_DATE, shortDate, todayIso, validatePeriod } from "@/lib/dates";

export const dynamic = "force-dynamic";

async function params(searchParams: PageProps<"/raport">["searchParams"]) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
  const today = todayIso();
  const raw = one(q.data);
  const date = isValidIso(raw) && raw >= MIN_DATE && raw <= today ? raw : today;
  const dzialka = one(q.dzialka);
  const uprawa = one(q.uprawa);
  const rawFrom = one(q.od);
  const od = rawFrom && validatePeriod(rawFrom, date, today) === null ? rawFrom : null;
  return { dzialka, date, od, uprawa };
}

export async function generateMetadata({ searchParams }: PageProps<"/raport">): Promise<Metadata> {
  const { dzialka, date } = await params(searchParams);
  return { title: dzialka ? `Działka ${dzialka.split(".").pop()} · ${shortDate(date)}` : "Raport" };
}

export default async function RaportPage({ searchParams }: PageProps<"/raport">) {
  const { dzialka, date, od, uprawa } = await params(searchParams);
  if (!dzialka) notFound();
  let report;
  try {
    report = await fetchReport({ dzialka, data: date, od, uprawa });
  } catch (e) {
    // No crop data for that year and none chosen → back to the start screen to pick one (pipeline_plan.md F0).
    if (e instanceof BackendError && e.status === 422) redirect(`/?${new URLSearchParams({ dzialka, data: date, ...(od ? { od } : {}) })}`);
    if (e instanceof BackendError && e.status === 404) notFound();
    throw e;
  }
  return <ReportScreen report={report} url={reportUrl({ dzialka: report.parcel.id, data: date, od, uprawa })} />;
}
