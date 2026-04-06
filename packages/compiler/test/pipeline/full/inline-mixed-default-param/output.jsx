const a = function a(a, b = 5) {
  return a.slice(0, b).map((a) => ({
    slug: a.slug,
  }));
};
const e = [];
export const Home = function Home() {
  const [v, x = 5] = [e];
  const e = v.slice(0, x).map((a) => ({
    slug: a.slug,
  }));
  return (
    <div>
      {e.map((a) => (
        <span key={a.slug}>{a.slug}</span>
      ))}
    </div>
  );
};
