async function $0($1) {
  for (const $4 of $1.matches) {
    const $37 = executeHead($1, $4.id);
    if ($37) {
      const $14 = await $37;
      $1.updateMatch($4.id, ($23) => ({
        ...$23,
        ...$14,
      }));
    }
    continue;
  }
}
export { $0 as loadMatches };
