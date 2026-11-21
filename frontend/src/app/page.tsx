import { StartScreen } from "@/components/start/start-screen";
import { todayIso } from "@/lib/dates";
import { DEMO_PARCEL_ID } from "@/lib/mock/parcels";

// "Today" must be computed per request, not at build time.
export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: PageProps<"/">) {
  const q = await searchParams;
  const id = typeof q.dzialka === "string" ? q.dzialka : DEMO_PARCEL_ID;
  return <StartScreen today={todayIso()} initialParcelId={id} />;
}
