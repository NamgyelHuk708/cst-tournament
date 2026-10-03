"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "../actions";

const FIELD =
  "mt-1.5 block h-13 w-full rounded-xl border border-border bg-card px-4 text-base outline-none transition-shadow focus:border-text focus:ring-2 focus:ring-text/15";

export function LoginForm({ notAdmin }: { notAdmin: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {
    error: notAdmin ? "This account doesn't have admin access." : null,
    email: "",
  });

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && (
        <p role="alert" className="rounded-xl border-l-4 border-text bg-card px-4 py-3 text-sm font-medium text-text ring-1 ring-border">
          {state.error}
        </p>
      )}
      <label className="block text-sm font-semibold">
        Email
        <input
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          defaultValue={state.email}
          className={FIELD}
        />
      </label>
      <label className="block text-sm font-semibold">
        Password
        <input name="password" type="password" autoComplete="current-password" required className={FIELD} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-14 w-full rounded-xl bg-text font-semibold text-white transition-opacity active:opacity-90 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="pt-2 text-center text-xs text-muted">Only the tournament admin can sign in here.</p>
    </form>
  );
}
