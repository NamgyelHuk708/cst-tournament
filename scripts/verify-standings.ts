// Cross-checks the app's standings (computeStandings in src/lib/tournament.ts) against
// the database's group_standings view. The view exists only for this check.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { fetchSnapshot } from "../src/lib/snapshot";
import { computeStandings, GROUP_CODES } from "../src/lib/tournament";

const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { persistSession: false },
});

async function main() {
  const snapshot = await fetchSnapshot(supabase);
  const app = computeStandings(snapshot.teams, snapshot.matches);
  const { data: view, error } = await supabase.from("group_standings").select("*");
  if (error) throw error;

  let mismatches = 0;
  for (const group of GROUP_CODES) {
    const fromView = view.filter((r) => r.group_code === group).sort((a, b) => a.position! - b.position!);
    const fromApp = app[group].rows;
    const lines: string[] = [];
    fromApp.forEach((row, i) => {
      const v = fromView[i];
      const appTuple = [row.team.short_code, row.played, row.won, row.drawn, row.lost, row.goalsFor, row.goalsAgainst, row.goalDifference, row.points, row.position];
      const viewTuple = [v?.short_code, v?.played, v?.won, v?.drawn, v?.lost, v?.goals_for, v?.goals_against, v?.goal_difference, v?.points, v?.position];
      const same = JSON.stringify(appTuple) === JSON.stringify(viewTuple);
      if (!same) mismatches++;
      lines.push(`${same ? " " : "✗"} ${row.position}. ${row.team.short_code}  P${row.played} W${row.won} D${row.drawn} L${row.lost} ${row.goalsFor}:${row.goalsAgainst} ${row.points}pts`);
    });
    console.log(`Group ${group} (${app[group].matchesPlayed}/${app[group].matchesTotal})\n${lines.join("\n")}`);
  }
  console.log(mismatches ? `\n${mismatches} row(s) differ.` : "\nApp standings match the database view for all 8 groups.");
  process.exit(mismatches ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
