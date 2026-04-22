function $0($1, $2, $3) {
  let blockparam_25 = undefined;
  if ($1) {
    blockparam_25 = $2;
    return blockparam_25;
  } else {
    blockparam_25 = $3;
    return blockparam_25;
  }
}
console.log($0(true, 1, 2));
