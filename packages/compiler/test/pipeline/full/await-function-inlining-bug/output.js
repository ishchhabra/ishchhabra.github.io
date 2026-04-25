function $0($4, $5) {
  return {
    top: $4.top - $5.height,
    right: $4.right - $5.width,
    bottom: $4.bottom - $5.height,
    left: $4.left - $5.width,
  };
}
function $1($36) {
  return $2.some(($40) => $36[$40] >= 0);
}
const $2 = ["top", "right", "bottom", "left"];
export const hide = function ($58) {
  return {
    name: "hide",
    options: $58,
    async fn($66) {
      const { rects: $67, platform: $68 } = $66;
      const $115 = $0(await $68.detectOverflow($66), $67.reference);
      return {
        data: {
          referenceHiddenOffsets: $115,
          referenceHidden: $1($115),
        },
      };
    },
  };
};
