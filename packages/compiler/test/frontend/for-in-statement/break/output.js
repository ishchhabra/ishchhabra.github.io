for (const $2 in obj) {
  if ($1 === "stop") {
    break;
  }
  console.log($1);
  continue;
}
