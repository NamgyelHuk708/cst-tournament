import { getPublicSnapshot, SNAPSHOT_CDN_SECONDS, SNAPSHOT_STALE_SECONDS } from "@/lib/public-snapshot";

// The public tournament snapshot, cached by Vercel's CDN for a few seconds: however many fans ask at
// once, Supabase is read about once per CDN region every few seconds. Browsers don't cache it (they
// get live changes over Realtime and only ask here to catch up). Admin pages read Supabase directly.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const body = await getPublicSnapshot();
    return Response.json(body, {
      headers: {
        "Cache-Control": "public, max-age=0, must-revalidate",
        "CDN-Cache-Control": `public, s-maxage=${SNAPSHOT_CDN_SECONDS}, stale-while-revalidate=${SNAPSHOT_STALE_SECONDS}`,
      },
    });
  } catch {
    return Response.json({ error: "Could not load tournament data" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
