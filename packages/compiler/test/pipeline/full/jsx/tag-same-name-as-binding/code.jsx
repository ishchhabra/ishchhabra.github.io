function highlightCode(c, l) {
  return c + l;
}

export function HighlightedCode({ code, lang }) {
  const html = highlightCode(code, lang);
  return (
    <pre>
      <code style={{ fontFamily: "mono" }} dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}

export function Example() {
  return <HighlightedCode code="x" lang="js" />;
}
