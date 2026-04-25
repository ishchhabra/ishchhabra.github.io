function $0($3, $4 = 5) {
  return $3.slice(0, $4).map(($13) => ({
    slug: $13.slug,
  }));
}
function $1() {
  return (
    <div>
      {$0($2).map(($37) => (
        <span key={$37.slug}>{$37.slug}</span>
      ))}
    </div>
  );
}
const $2 = [];
export { $1 as Home };
