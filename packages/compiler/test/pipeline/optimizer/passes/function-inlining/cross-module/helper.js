export function getDb() {
  return create(getPool());
}

let pool = null;

function getPool() {
  if (!pool) {
    pool = makePool();
  }
  return pool;
}
