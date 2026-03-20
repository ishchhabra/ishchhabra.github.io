const $0_0 = [];
export function Home() {
  const $20_0 = $0_0.slice(0, 5).map(($13_0) => ({
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
