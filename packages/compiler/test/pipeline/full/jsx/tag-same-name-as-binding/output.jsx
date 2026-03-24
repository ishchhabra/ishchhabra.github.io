export function HighlightedCode({ code: $9_0, lang: $12_0 }) {
  const [$52_0, $53_0] = [$9_0, $12_0];
  return (
    <pre>
      <code
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
