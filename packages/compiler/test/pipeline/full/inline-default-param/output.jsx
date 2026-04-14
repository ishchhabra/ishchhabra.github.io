function $0_0($3_0 = 5) {
  return $2_0.slice(0, $3_0).map(($14_0) => ({
    slug: $14_0.slug,
  }));
}
function $1_0() {
  return (
    <div>
      {$0_0().map(($35_0) => (
        <span key={$35_0.slug}>{$35_0.slug}</span>
      ))}
    </div>
  );
}
const $2_0 = [];
export { $1_0 as Home };
