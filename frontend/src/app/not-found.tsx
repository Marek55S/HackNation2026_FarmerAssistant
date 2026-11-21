import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-extrabold">Nie znaleźliśmy tej działki</h1>
      <p className="text-ink-3">Sprawdź identyfikator działki albo wskaż ją na mapie.</p>
      <Link href="/" className="rounded-xl bg-primary px-5 py-3 font-bold text-white no-underline">
        Wróć do wyboru działki
      </Link>
    </main>
  );
}
