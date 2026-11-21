"use client";

import Link from "next/link";
import { ICON, Icon } from "./ui";

type Tab = "dzialki" | "raport" | "mapa" | "zapytaj";

/** Bottom navigation on phones (mockup "Telefon w polu"); hidden from tablet width up. */
export function MobileNav({
  active,
  reportHref,
  onAsk,
}: {
  active: Tab;
  reportHref: string | null;
  onAsk?: () => void;
}) {
  const item = (tab: Tab, label: string, icon: string, href: string | null, onClick?: () => void) => {
    const cls = `flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold no-underline ${active === tab ? "text-primary" : "text-muted"} ${!href && !onClick ? "opacity-40" : ""}`;
    const content = (
      <>
        <Icon d={icon} size={22} />
        {label}
      </>
    );
    if (onClick)
      return (
        <button key={tab} onClick={onClick} className={cls}>
          {content}
        </button>
      );
    if (!href)
      return (
        <span key={tab} className={cls} aria-disabled="true">
          {content}
        </span>
      );
    return (
      <Link key={tab} href={href} prefetch={false} className={cls} aria-current={active === tab ? "page" : undefined}>
        {content}
      </Link>
    );
  };
  return (
    <nav
      aria-label="Nawigacja"
      className="no-print safe-bottom fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-rule bg-paper px-1 pt-1.5 md:hidden"
    >
      {item("dzialki", "Działki", ICON.fields, "/")}
      {item("raport", "Raport", ICON.doc, reportHref)}
      {item("mapa", "Mapa", ICON.pin, reportHref ? `${reportHref.split("#")[0]}#mapa` : null)}
      {item("zapytaj", "Zapytaj", ICON.chat, null, onAsk)}
    </nav>
  );
}
