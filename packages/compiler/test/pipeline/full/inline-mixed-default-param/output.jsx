function $0($3, $4 = 5) {
  return $3.slice(0, $4).map(($13) => ({
    slug: $13.slug,
  }));
}
function $1() {
  return (
    <div>
      {$0($2).map(($39) => (
        <span key={$39.slug}>{$39.slug}</span>
      ))}
    </div>
  );
}
const $2 = [];
export { $1 as Home };
