async function $0_0($1_0) {
  for (const $4_0 of $1_0.matches) {
    const $6_0 = executeHead($1_0, $4_0.id);
    if ($6_0) {
      const $14_0 = await $6_0;
      $1_0.updateMatch($4_0.id, ($22_0) => ({
        ...$22_0,
        ...$14_0,
      }));
    }
  }
}
export { $0_0 as loadMatches };
