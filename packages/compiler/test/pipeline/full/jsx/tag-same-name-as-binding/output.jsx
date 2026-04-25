function $0($3, $4) {
  return $3 + $4;
}
function $1({ code: $9, lang: $10 }) {
  return (
    <pre>
      <code
        style={{
          fontFamily: "mono",
        }}
        dangerouslySetInnerHTML={{
          __html: $0($9, $10),
        }}
      />
    </pre>
  );
}
function $2() {
  return <$1 code="x" lang="js" />;
}
export { $1 as HighlightedCode };
export { $2 as Example };
