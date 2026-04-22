async function $0($1) {
  for (const $5 of $1.matches) {
    const $35 = executeHead($1, $4.id);
    if ($35) {
      const $14 = await $35;
      $1.updateMatch($4.id, ($22) => ({
        ...$22,
        ...$14,
      }));
    }
  }
}
export { $0 as loadMatches };
