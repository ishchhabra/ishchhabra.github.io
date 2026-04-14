function $0_0($3_0, $4_0) {
  return $3_0 + $4_0;
}
function $1_0({ code: $8_0, lang: $9_0 }) {
  return (
    <pre>
      <code
        style={{
          fontFamily: "mono",
        }}
        dangerouslySetInnerHTML={{
          __html: $0_0($8_0, $9_0),
        }}
      />
    </pre>
  );
}
function $2_0() {
  return <$1_0 code="x" lang="js" />;
}
export { $1_0 as HighlightedCode };
export { $2_0 as Example };
