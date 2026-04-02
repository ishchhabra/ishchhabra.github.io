export function HighlightedCode({ code: $6_0, lang: $7_0 }) {
  const $50_0 = $6_0;
  const $51_0 = $7_0;
  const $13_0 = $50_0 + $51_0;
  return (
    <pre>
      <code
        style={{
          fontFamily: "mono",
        }}
        dangerouslySetInnerHTML={{
          __html: $13_0,
        }}
      />
    </pre>
  );
}
export function Example() {
  return <HighlightedCode code="x" lang="js" />;
}
