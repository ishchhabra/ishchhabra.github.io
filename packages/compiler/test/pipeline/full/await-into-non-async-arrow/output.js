async function $0($1) {
  for (const $4 of $1.matches) {
    const $6 = executeHead($1, $4.id);
    if ($6) {
      const $14 = await $6;
      $1.updateMatch($4.id, ($22) => ({
        ...$22,
        ...$14,
      }));
    }
  }
}
export { $0 as loadMatches };
