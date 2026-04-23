function $0($4, $5) {
  return {
    top: $4.top - $5.height,
    right: $4.right - $5.width,
    bottom: $4.bottom - $5.height,
    left: $4.left - $5.width,
  };
}
function $1($35) {
  return $2.some(($39) => $35[$39] >= 0);
}
const $2 = ["top", "right", "bottom", "left"];
const $3 = function ($54) {
  return {
    name: "hide",
    options: $54,
    async fn($62) {
      const { rects: $63, platform: $64 } = $62;
      const $109 = $0(await $64.detectOverflow($62), $63.reference);
      return {
        data: {
          referenceHiddenOffsets: $109,
          referenceHidden: $1($109),
        },
      };
    },
  };
};
export { $3 as hide };
