export function HighlightedCode({ code: $5_0, lang: $6_0 }) {
  const $50_0 = $5_0;
  const $51_0 = $6_0;
  const $12_0 = $50_0 + $51_0;
  return (
    <pre>
      <code
        style={{
          fontFamily: "mono",
        }}
        dangerouslySetInnerHTML={{
          __html: $12_0,
        }}
      />
    </pre>
  );
}
export function Example() {
  return <HighlightedCode code="x" lang="js" />;
}
