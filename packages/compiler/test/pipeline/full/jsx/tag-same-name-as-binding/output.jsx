export function HighlightedCode({ code: $9_0, lang: $12_0 }) {
  const $15_0 = $9_0 + $12_0;
  return (
    <pre>
      <code
        style={{
          fontFamily: "mono",
        }}
        dangerouslySetInnerHTML={{
          __html: $15_0,
        }}
      />
    </pre>
  );
}
export function Example() {
  return <HighlightedCode code="x" lang="js" />;
}
