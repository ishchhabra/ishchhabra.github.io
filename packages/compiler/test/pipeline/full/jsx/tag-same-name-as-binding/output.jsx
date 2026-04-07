function $0_0($3_0, $4_0) {
  return $3_0 + $4_0;
}
export function HighlightedCode({ code: $6_0, lang: $7_0 }) {
  const $50_0 = $6_0;
  const $51_0 = $7_0;
  const html = $50_0 + $51_0;
  return (
    <pre>
      <code
        style={{
          fontFamily: "mono",
        }}
        dangerouslySetInnerHTML={{
          __html: html,
        }}
      />
    </pre>
  );
}
export function Example() {
  return <HighlightedCode code="x" lang="js" />;
}
