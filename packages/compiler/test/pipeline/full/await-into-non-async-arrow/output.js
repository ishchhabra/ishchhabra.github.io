async function $0($1) {
  for (const $4 of $1.matches) {
    const $35 = executeHead($1, $4.id);
    if ($35) {
      const $13 = await $35;
      $1.updateMatch($4.id, ($21) => ({
        ...$21,
        ...$13,
      }));
    }
    continue;
  }
}
export { $0 as loadMatches };
