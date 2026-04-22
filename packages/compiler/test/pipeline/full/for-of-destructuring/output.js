for (const $3 of points) {
  ({ x: $1, y: $2 } = $3);
  console.log($1, $2);
  continue;
}
