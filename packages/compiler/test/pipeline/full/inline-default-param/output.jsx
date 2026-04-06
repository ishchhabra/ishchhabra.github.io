const a = function a(a = 5) {
  return g.slice(0, a).map((a) => ({
    slug: a.slug,
  }));
};
const g = [];
export const Home = function Home() {
  const [u = 5] = [];
  const d = g.slice(0, u).map((a) => ({
    slug: a.slug,
  }));
  return (
    <div>
      {d.map((a) => (
        <span key={a.slug}>{a.slug}</span>
      ))}
    </div>
  );
};
