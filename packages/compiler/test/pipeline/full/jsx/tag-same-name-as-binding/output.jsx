export function HighlightedCode({ code: $9_0, lang: $12_0 }) {
  return (
    <pre>
      <$9_0
        style={{
          fontFamily: "mono",
        }}
        dangerouslySetInnerHTML={{
          __html: $9_0 + $12_0,
        }}
      />
    </pre>
  );
}
export function Example() {
  return <HighlightedCode code="x" lang="js" />;
}
