function $0($1) {
  let $15;
  for (const $8 of Object.entries($1)) {
    const [$6, $7] = $8;
    if ($6 !== "x") {
      if ($7) {
        $15 = "";
      } else {
        $15 = String($7);
      }
      g($15);
    }
    continue;
  }
}
