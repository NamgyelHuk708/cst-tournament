import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Admin sign in · CST Silver Jubilee Football" };

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8 flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full border-2 border-accent bg-text font-display text-lg font-bold text-white tabular">
          25
        </span>
        <div className="leading-tight">
          <h1 className="font-display text-2xl font-bold">Match control</h1>
          <p className="text-sm text-muted">CST Silver Jubilee Football · Admin</p>
        </div>
      </div>
      <LoginForm notAdmin={error === "not-admin"} />
    </main>
  );
}
