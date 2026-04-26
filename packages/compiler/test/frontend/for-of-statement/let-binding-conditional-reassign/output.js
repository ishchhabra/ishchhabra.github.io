let $12;
for (let $1 of items) {
  if (condition) {
    const $16 = $1 + 1;
    $12 = $16;
  } else {
    $12 = $1;
  }
  console.log($12);
  continue;
}
