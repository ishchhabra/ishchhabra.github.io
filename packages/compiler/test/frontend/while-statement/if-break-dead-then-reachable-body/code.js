while (someCond) {
  if (cond) {
    break;
    console.log("dead-after-break-in-if");
  }
  console.log("reachable-after-if");
}
