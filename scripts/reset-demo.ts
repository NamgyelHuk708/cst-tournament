import { resetDemo } from "./lib/reset-demo";

resetDemo()
  .then(({ events, players, matches, knockouts, extra }) => {
    console.log(
      `Demo data cleared: ${matches} matches reset, ${events} events and ${players} players removed, ` +
        (knockouts ? `knockout stage cleared (${knockouts} ties).` : "knockout stage left alone (not demo)."),
    );
    for (const [table, n] of Object.entries(extra)) console.log(`  ${table}: ${n} demo rows removed`);
    console.log("Safety check passed: no real match, event or player changed.");
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
