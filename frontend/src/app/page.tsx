import { StartScreen } from "@/components/start/start-screen";
import { isValidIso, MIN_DATE, todayIso, validatePeriod } from "@/lib/dates";
import { DEMO_PARCEL_ID } from "@/lib/mock/parcels";

// "Today" must be computed per request, not at build time.
export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: PageProps<"/">) {
  const q = await searchParams;
  const today = todayIso();
  const id = typeof q.dzialka === "string" ? q.dzialka : DEMO_PARCEL_ID;
  const d = typeof q.data === "string" ? q.data : null;
  const date = isValidIso(d) && d >= MIN_DATE && d <= today ? d : today;
  const f = typeof q.od === "string" ? q.od : null;
  const from = f && validatePeriod(f, date, today) === null ? f : null;
  return <StartScreen today={today} initialParcelId={id} initialDate={date} initialFrom={from} />;
}
