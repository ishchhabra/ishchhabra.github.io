export function create(cb) {
  function run(x) {
    top: do {
      cb(x);
    } while (x.next);
  }
  return run;
}
