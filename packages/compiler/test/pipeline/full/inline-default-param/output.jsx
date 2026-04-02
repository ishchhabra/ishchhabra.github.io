export function Home() {
  const [$47_0 = 5] = [];
  const $19_0 = $0_0.slice(0, $47_0).map(($12_0) => ({
    slug: $12_0.slug,
  }));
  return (
    <div>
      {$19_0.map(($30_0) => (
        <span key={$30_0.slug}>{$30_0.slug}</span>
      ))}
    </div>
  );
}
