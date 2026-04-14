function $0_0($3_0, $4_0 = 5) {
  return $3_0.slice(0, $4_0).map(($15_0) => ({
    slug: $15_0.slug,
  }));
}
function $1_0() {
  return (
    <div>
      {$0_0($2_0).map(($37_0) => (
        <span key={$37_0.slug}>{$37_0.slug}</span>
      ))}
    </div>
  );
}
const $2_0 = [];
export { $1_0 as Home };
