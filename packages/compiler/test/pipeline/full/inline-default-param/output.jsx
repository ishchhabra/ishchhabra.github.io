export function Home() {
  const [$48_0 = 5] = [];
  const $20_0 = $0_0.slice(0, $48_0).map(($13_0) => ({
    slug: $13_0.slug,
  }));
  return (
    <div>
      {$20_0.map(($31_0) => (
        <span key={$31_0.slug}>{$31_0.slug}</span>
      ))}
    </div>
  );
}
