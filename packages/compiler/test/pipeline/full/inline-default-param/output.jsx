export const Home = function Home() {
  const [$49_0 = 5] = [];
  const $18_0 = $0_0.slice(0, $49_0).map(($10_0) => ({
    slug: $10_0.slug,
  }));
  return (
    <div>
      {$18_0.map(($29_0) => (
        <span key={$29_0.slug}>{$29_0.slug}</span>
      ))}
    </div>
  );
};
