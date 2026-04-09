function $0_0($3_0, $4_0) {
  return $3_0 + $4_0;
}
export function HighlightedCode({ code: $6_0, lang: $7_0 }) {
  return (
    <pre>
      <code
        style={{
          fontFamily: "mono",
        }}
        dangerouslySetInnerHTML={{
          __html: $6_0 + $7_0,
        }}
      />
    </pre>
  );
}
export function Example() {
  return <HighlightedCode code="x" lang="js" />;
}
