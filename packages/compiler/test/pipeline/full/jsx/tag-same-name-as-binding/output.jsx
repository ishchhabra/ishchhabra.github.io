export function HighlightedCode({ code: $7_0, lang: $10_0 }) {
  const $13_0 = $7_0 + $10_0;
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
