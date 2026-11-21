"use client";

import Link from "next/link";
import { ICON, Icon } from "./ui";

type Tab = "dzialki" | "raport" | "mapa";

/**
 * Bottom navigation on phones (mockup "Telefon w polu"); hidden from tablet width up.
 * Only shown when there is a report to go to — every visible control has to work.
 */
export function MobileNav({ active, reportHref }: { active: Tab; reportHref: string | null }) {
  if (!reportHref) return null;
  const items: [Tab, string, string, string][] = [
    ["dzialki", "Działki", ICON.fields, "/"],
    ["raport", "Raport", ICON.doc, reportHref],
    ["mapa", "Mapa", ICON.pin, `${reportHref.split("#")[0]}#mapa`],
  ];
  return (
    <nav
      aria-label="Nawigacja"
      className="mobile-nav no-print safe-bottom fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-rule bg-paper px-1 pt-1.5 md:hidden"
    >
      {items.map(([tab, label, icon, href]) => (
        <Link
          key={tab}
          href={href}
          prefetch={false}
          aria-current={active === tab ? "page" : undefined}
          className={`flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold no-underline ${active === tab ? "text-primary" : "text-muted"}`}
        >
          <Icon d={icon} size={22} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
