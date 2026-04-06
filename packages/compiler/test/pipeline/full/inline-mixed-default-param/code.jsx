const ARTICLES = [];

function getPreview(arr, limit = 5) {
  return arr.slice(0, limit).map((a) => ({ slug: a.slug }));
}

export function Home() {
  const articles = getPreview(ARTICLES);
  return (
    <div>
      {articles.map((a) => (
        <span key={a.slug}>{a.slug}</span>
      ))}
    </div>
  );
}
