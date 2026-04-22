function $0($1) {
  if ($1 < 0) {
    throw new Error("negative");
  }
  return $1 + 1;
}
