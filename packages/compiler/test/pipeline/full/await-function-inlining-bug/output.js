function $0_0($4_0, $5_0) {
  return {
    top: $4_0.top - $5_0.height,
    right: $4_0.right - $5_0.width,
    bottom: $4_0.bottom - $5_0.height,
    left: $4_0.left - $5_0.width,
  };
}
function $1_0($35_0) {
  return $2_0.some(($38_0) => $35_0[$38_0] >= 0);
}
const $2_0 = ["top", "right", "bottom", "left"];
const $3_0 = function ($52_0) {
  return {
    name: "hide",
    options: $52_0,
    async fn($60_0) {
      const { rects: $61_0, platform: $62_0 } = $60_0;
      const $64_0 = $0_0(await $62_0.detectOverflow($60_0), $61_0.reference);
      return {
        data: {
          referenceHiddenOffsets: $64_0,
          referenceHidden: $1_0($64_0),
        },
      };
    },
  };
};
export { $3_0 as hide };
