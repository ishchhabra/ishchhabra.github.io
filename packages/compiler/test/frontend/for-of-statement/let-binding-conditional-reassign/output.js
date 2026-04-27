let $12;
for (let $1 of items) {
  if (condition) {
    $12 = $1 + 1;
  } else {
    $12 = $1;
  }
  console.log($12);
  continue;
}
