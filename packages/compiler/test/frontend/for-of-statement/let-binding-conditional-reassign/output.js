let $12;
for (let $1 of items) {
  if (condition) {
    const $15 = $1 + 1;
    $12 = $15;
  } else {
    $12 = $1;
  }
  console.log($12);
  continue;
}
