const ARTICLES = [];

function getPreview(limit = 5) {
  return ARTICLES.slice(0, limit).map((a) => ({ slug: a.slug }));
}

export function Home() {
  const articles = getPreview();
  return (
    <div>
      {articles.map((a) => (
        <span key={a.slug}>{a.slug}</span>
      ))}
    </div>
  );
}
