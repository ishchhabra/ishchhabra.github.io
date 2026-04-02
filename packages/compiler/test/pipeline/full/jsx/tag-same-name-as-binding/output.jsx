export const HighlightedCode = function HighlightedCode({ code: $7_0, lang: $8_0 }) {
  const $53_0 = $7_0;
  const $54_0 = $8_0;
  const $14_0 = $53_0 + $54_0;
  return (
    <pre>
      <code
        style={{
          fontFamily: "mono",
        }}
        dangerouslySetInnerHTML={{
          __html: $14_0,
        }}
      />
    </pre>
  );
};
export const Example = function Example() {
  return <HighlightedCode code="x" lang="js" />;
};
