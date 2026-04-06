const a = function a(a, b) {
  return a + b;
};
export const HighlightedCode = function HighlightedCode({ code: a, lang: b }) {
  const $53_0 = a;
  const $54_0 = b;
  const d = $53_0 + $54_0;
  return (
    <pre>
      <code
        style={{
          fontFamily: "mono",
        }}
        dangerouslySetInnerHTML={{
          __html: d,
        }}
      />
    </pre>
  );
};
export const Example = function Example() {
  return <HighlightedCode code="x" lang="js" />;
};
