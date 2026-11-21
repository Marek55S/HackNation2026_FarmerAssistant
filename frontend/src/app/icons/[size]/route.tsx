import { iconImage } from "@/components/icon-image";

// /icons/192, /icons/512, /icons/maskable-512 — rendered once at build time.
const SIZES = ["192", "512", "maskable-512"] as const;

export const dynamic = "force-static";

export function generateStaticParams() {
  return SIZES.map((size) => ({ size }));
}

export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size } = await ctx.params;
  if (!SIZES.includes(size as (typeof SIZES)[number])) return new Response("Not found", { status: 404 });
  const maskable = size.startsWith("maskable-");
  return iconImage(Number(size.replace("maskable-", "")), maskable);
}
