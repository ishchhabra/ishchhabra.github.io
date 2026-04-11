async function loadMatches(inner) {
  for (const match of inner.matches) {
    const headResult = executeHead(inner, match.id);
    if (headResult) {
      const head = await headResult;
      inner.updateMatch(match.id, (prev) => ({
        ...prev,
        ...head,
      }));
    }
  }
}

export { loadMatches };
