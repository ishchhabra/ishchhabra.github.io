function $0_0($5_0, $6_0) {
  return $5_0 + $6_0;
}
export function HighlightedCode({ code: $9_0, lang: $12_0 }) {
  const [$52_0, $53_0] = [$9_0, $12_0];
  return (
    <pre>
      <$9_0
        style={{
          fontFamily: "mono",
        }}
        dangerouslySetInnerHTML={{
          __html: $52_0 + $53_0,
        }}
      />
    </pre>
  );
}
export function Example() {
  return <HighlightedCode code="x" lang="js" />;
}
