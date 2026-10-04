import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      <span className="grid size-12 place-items-center rounded-full border-2 border-accent bg-brand font-display text-lg font-bold text-white">
        25
      </span>
      <p className="mt-4 font-display text-2xl font-bold">Page not found</p>
      <p className="mt-2 text-sm text-muted">That page doesn&apos;t exist. The scores are on the Live page.</p>
      <Link href="/" className="mt-6 grid h-12 w-full place-items-center rounded-xl bg-brand font-semibold text-white active:opacity-90">
        Go to Live scores
      </Link>
    </main>
  );
}
