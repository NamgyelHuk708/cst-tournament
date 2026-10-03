// Server clock for match minutes and countdowns, so every device shows the same minute
// regardless of how accurate the phone's own clock is.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
