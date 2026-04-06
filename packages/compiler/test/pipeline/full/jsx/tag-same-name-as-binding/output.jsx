const a = function a(a, b) {
  return a + b;
};
export const HighlightedCode = function HighlightedCode({ code: a, lang: b }) {
  const N = a;
  const O = b;
  const m = N + O;
  return (
    <pre>
      <code
        style={{
          fontFamily: "mono",
        }}
        dangerouslySetInnerHTML={{
          __html: m,
        }}
      />
    </pre>
  );
};
export const Example = function Example() {
  return <HighlightedCode code="x" lang="js" />;
};
