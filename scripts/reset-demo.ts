import { resetDemo } from "./lib/reset-demo";

resetDemo()
  .then(({ events, players, matches }) =>
    console.log(`Demo data cleared: ${matches} matches reset, ${events} events and ${players} players removed.`),
  )
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
