"use client";

import { useState } from "react";

/**
 * Returns a counter that increases whenever `value` changes after the first render.
 * Use it as a React key with the `score-flash` class to highlight a new score once.
 */
export function useFlashOnChange<T>(value: T): number {
  const [prev, setPrev] = useState(value);
  const [count, setCount] = useState(0);
  if (!Object.is(prev, value)) {
    setPrev(value);
    setCount((c) => c + 1);
  }
  return count;
}
