export function Home() {
  const [$47_0 = 5] = [];
  const $17_0 = $0_0.slice(0, $47_0).map(($10_0) => ({
    slug: $10_0.slug,
  }));
  return (
    <div>
      {$17_0.map(($28_0) => (
        <span key={$28_0.slug}>{$28_0.slug}</span>
      ))}
    </div>
  );
}
