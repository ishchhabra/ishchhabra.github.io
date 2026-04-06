const $0_0 = function $0_0($3_0, $4_0) {
  return $3_0 + $4_0;
};
export const HighlightedCode = function HighlightedCode({ code: $7_0, lang: $8_0 }) {
  const $53_0 = $7_0;
  const $54_0 = $8_0;
  const html = $53_0 + $54_0;
  return (
    <pre>
      <code
        style={{
          fontFamily: "mono",
        }}
        dangerouslySetInnerHTML={{
          __html: html,
        }}
      />
    </pre>
  );
};
export const Example = function Example() {
  return <HighlightedCode code="x" lang="js" />;
};
