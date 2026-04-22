for (const $2 in obj) {
  if ($1 === "skip") {
    continue;
  }
  console.log($1);
  continue;
}
