const a = function a(a, b = 5) {
  return a.slice(0, b).map((a) => ({
    slug: a.slug,
  }));
};
const d = [];
export const Home = function Home() {
  const [$51_0, $53_0 = 5] = [d];
  const b = $51_0.slice(0, $53_0).map((a) => ({
    slug: a.slug,
  }));
  return (
    <div>
      {b.map((a) => (
        <span key={a.slug}>{a.slug}</span>
      ))}
    </div>
  );
};
