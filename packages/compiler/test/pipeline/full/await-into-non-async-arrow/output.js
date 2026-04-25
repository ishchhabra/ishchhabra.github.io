async function $0($1) {
  for (const $4 of $1.matches) {
    const $34 = executeHead($1, $4.id);
    if ($34) {
      const $13 = await $34;
      $1.updateMatch($4.id, ($21) => ({
        ...$21,
        ...$13,
      }));
    }
    continue;
  }
}
export { $0 as loadMatches };
