// Read-only snapshot of every table and view in the public schema, via the REST API with the
// service role key (reads only: GET requests). Used by backup:live and compare:live.
// Tables are discovered from the API's own description, so new tables are included automatically.

export type TableSnapshot = { primaryKey: string[]; rows: Record<string, unknown>[] };
export type LiveSnapshot = { takenAt: string; project: string; tables: Record<string, TableSnapshot> };

const PAGE = 1000;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}. Run via npm so .env.local is loaded.`);
  return v;
}

export async function takeSnapshot(): Promise<LiveSnapshot> {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const spec = (await (await fetch(`${url}/rest/v1/`, { headers: { ...headers, Accept: "application/openapi+json" } })).json()) as {
    definitions: Record<string, { properties: Record<string, { description?: string }> }>;
  };
  const tables: Record<string, TableSnapshot> = {};
  for (const [name, def] of Object.entries(spec.definitions).sort(([a], [b]) => a.localeCompare(b))) {
    const primaryKey = Object.entries(def.properties)
      .filter(([, p]) => p.description?.includes("<pk/>"))
      .map(([col]) => col);
    const order = (primaryKey.length ? primaryKey : Object.keys(def.properties)).map((c) => `${c}.asc`).join(",");
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE) {
      const res = await fetch(`${url}/rest/v1/${name}?select=*&order=${order}`, {
        headers: { ...headers, Range: `${from}-${from + PAGE - 1}`, "Range-Unit": "items" },
      });
      if (!res.ok) throw new Error(`Reading ${name}: ${res.status} ${await res.text()}`);
      const page = (await res.json()) as Record<string, unknown>[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    tables[name] = { primaryKey, rows };
  }
  return { takenAt: new Date().toISOString(), project: new URL(url).hostname.split(".")[0], tables };
}

/** Tables and views in the public schema, with their columns (from the API description). */
export async function listTables(): Promise<{ name: string; columns: string[] }[]> {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const spec = (await (
    await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/openapi+json" } })
  ).json()) as { definitions: Record<string, { properties: Record<string, unknown> }> };
  return Object.entries(spec.definitions).map(([name, d]) => ({ name, columns: Object.keys(d.properties) }));
}
