"use client";

// When the report cannot be computed (analysis server down or timed out) the page shows this instead of crashing.
// In production the server's message is hidden, so the text does not depend on it.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { AppHeader } from "@/components/app-header";
import { Backdrop } from "@/components/backdrop";
import { Card, ICON, Icon } from "@/components/ui";

export default function RaportError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="relative isolate min-h-screen text-ink">
      <Backdrop />
      <AppHeader active="raport" reportHref={null} />
      <main className="mx-auto flex max-w-[720px] flex-col px-8 pb-14 pt-12 max-sm:px-4 max-sm:pt-6">
        <Card className="flex flex-col gap-4 p-8 max-sm:p-5">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-warn-bg text-warn-ink" aria-hidden="true">
            <Icon d={ICON.warn} size={26} stroke={1.8} />
          </span>
          <h1 className="text-[24px] font-semibold leading-tight text-heading">Nie udało się przygotować raportu</h1>
          <p className="text-[15px] leading-relaxed text-ink-2">
            Serwer analizy nie odpowiada albo przerwał pracę. Twoje dane nie zginęły — spróbuj ponownie za chwilę albo wybierz działkę jeszcze raz.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={() =>
                startTransition(() => {
                  router.refresh();
                  reset();
                })
              }
              className="inline-flex min-h-11 items-center gap-2 rounded-[var(--r-btn)] bg-btn px-5 text-sm font-semibold text-btn-ink hover:bg-btn-hover"
            >
              Spróbuj ponownie
            </button>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-2 rounded-[var(--r-btn)] border border-rule-strong bg-paper px-5 text-sm font-semibold text-ink no-underline hover:border-ink-3"
            >
              Wróć do wyboru działki
              <Icon d={ICON.arrowRight} size={16} />
            </Link>
          </div>
        </Card>
      </main>
    </div>
  );
}
