async function $0_0($1_0) {
  for (const $3_0 of $1_0.matches) {
    const $5_0 = executeHead($1_0, $3_0.id);
    if ($5_0) {
      const $10_0 = await $5_0;
      $1_0.updateMatch($3_0.id, ($15_0) => ({
        ...$15_0,
        ...$10_0,
      }));
    }
  }
}
export { $0_0 as loadMatches };
