"use client";

import { useEffect } from "react";

// Shown if something unexpected breaks while rendering a page.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-2xl font-bold">Something went wrong</p>
      <p className="mt-2 text-sm text-muted">The scores are safe. Try again, or reload the page.</p>
      <div className="mt-6 grid w-full grid-cols-2 gap-3">
        <button type="button" onClick={retry} className="h-12 rounded-xl bg-text font-semibold text-white active:opacity-90">
          Try again
        </button>
        <a href="" className="grid h-12 place-items-center rounded-xl font-semibold ring-1 ring-border active:bg-card">
          Reload
        </a>
      </div>
    </main>
  );
}
