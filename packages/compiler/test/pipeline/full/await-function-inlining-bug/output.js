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
export const hide = function ($55) {
  return {
    name: "hide",
    options: $55,
    async fn($63) {
      const { rects: $64, platform: $65 } = $63;
      const $109 = $0(await $65.detectOverflow($63), $64.reference);
      return {
        data: {
          referenceHiddenOffsets: $109,
          referenceHidden: $1($109),
        },
      };
    },
  };
};
