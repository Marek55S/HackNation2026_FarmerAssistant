"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./ui";

type Tab = "start" | "raport";

/**
 * Top bar shared by all screens: brand, text tabs with an underlined active tab (Smartfarm-like),
 * actions on the right. On phones the tabs move to the bottom navigation (MobileNav).
 */
export function AppHeader({
  active,
  reportHref,
  children,
}: {
  active: Tab;
  /** Link to the last report; the "Raport" tab is shown only when there is one */
  reportHref: string | null;
  /** Actions on the right */
  children?: ReactNode;
}) {
  const tabs: { id: Tab; label: string; href: string | null }[] = [
    { id: "start", label: "Sprawdź działkę", href: "/" },
    { id: "raport", label: "Raport", href: reportHref },
  ];
  return (
    <header className="app-header no-print border-b border-rule bg-paper">
      <div className="mx-auto flex min-h-16 max-w-[1376px] items-stretch gap-8 px-8 max-sm:min-h-14 max-sm:gap-3 max-sm:px-4">
        <Link href="/" className="flex items-center gap-2.5 text-ink no-underline">
          <Logo size={30} />
          <span className="flex flex-col leading-tight">
            <span className="brand-name font-[family-name:var(--font-display)] text-[17px] font-bold tracking-tight text-heading">
              Hydrowise
            </span>
            <span className="brand-sub text-[11px] text-muted max-sm:hidden">woda na Twojej działce</span>
          </span>
        </Link>
        <nav aria-label="Główna nawigacja" className="flex items-stretch gap-1 max-md:hidden">
          {tabs.map((t) =>
            t.href ? (
              <Link
                key={t.id}
                href={t.href}
                prefetch={false}
                aria-current={active === t.id ? "page" : undefined}
                className={`relative flex items-center px-4 text-sm no-underline ${
                  active === t.id
                    ? "font-semibold text-heading after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-full after:bg-heading"
                    : "font-medium text-ink-2 hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            ) : null,
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">{children}</div>
      </div>
    </header>
  );
}
