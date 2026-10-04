"use client";

import { createContext, useContext } from "react";

export const MatchSheetContext = createContext<((matchId: number) => void) | null>(null);

/**
 * Opens the match detail sheet. Null when the feature is off: match rows then keep their
 * inline details and nothing else changes.
 */
export function useMatchSheet(): ((matchId: number) => void) | null {
  return useContext(MatchSheetContext);
}
