"use client";

import { useEffect, useRef } from "react";

/**
 * Bottom sheet built on <dialog>: focus trap, Escape to close and inert background
 * come from the browser. Tapping the backdrop closes it.
 */
export function Sheet({
  open,
  onClose,
  title,
  hideTitle = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** For sheets whose content has its own heading: the title is still read by screen readers. */
  hideTitle?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Closing from code (open became false) must not call onClose: the parent already
  // changed state, possibly to open a different sheet.
  const closingFromCode = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) {
      closingFromCode.current = true;
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={() => {
        if (closingFromCode.current) {
          closingFromCode.current = false;
          return;
        }
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 mx-auto max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-card p-0 text-text shadow-2xl backdrop:bg-text/55"
    >
      {open && (
        <div className="px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] has-[.sticky]:pb-0">
          <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
          <h2 className={hideTitle ? "sr-only" : "font-display text-xl font-bold"}>{title}</h2>
          <div className={hideTitle ? "" : "mt-4"}>{children}</div>
        </div>
      )}
    </dialog>
  );
}
