function $0_0($4_0, $5_0) {
  return {
    top: $4_0.top - $5_0.height,
    right: $4_0.right - $5_0.width,
    bottom: $4_0.bottom - $5_0.height,
    left: $4_0.left - $5_0.width,
  };
}
function $1_0($27_0) {
  return $2_0.some(($29_0) => $27_0[$29_0] >= 0);
}
const $2_0 = ["top", "right", "bottom", "left"];
const $3_0 = function ($41_0) {
  return {
    name: "hide",
    options: $41_0,
    async fn($48_0) {
      const { rects: $49_0, platform: $50_0 } = $48_0;
      const $114_0 = await $50_0.detectOverflow($48_0);
      const $116_0 = $49_0.reference;
      const $52_0 = {
        top: $114_0.top - $116_0.height,
        right: $114_0.right - $116_0.width,
        bottom: $114_0.bottom - $116_0.height,
        left: $114_0.left - $116_0.width,
      };
      return {
        data: {
          referenceHiddenOffsets: $52_0,
          referenceHidden: $2_0.some(($29_0) => $52_0[$29_0] >= 0),
        },
      };
    },
  };
};
export { $3_0 as hide };
