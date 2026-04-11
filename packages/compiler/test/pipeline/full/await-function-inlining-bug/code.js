const sides = ["top", "right", "bottom", "left"];

function getSideOffsets(overflow, rect) {
  return {
    top: overflow.top - rect.height,
    right: overflow.right - rect.width,
    bottom: overflow.bottom - rect.height,
    left: overflow.left - rect.width,
  };
}

function isAnySideFullyClipped(overflow) {
  return sides.some((side) => overflow[side] >= 0);
}

export const hide = function (options) {
  return {
    name: "hide",
    options,
    async fn(state) {
      const { rects, platform } = state;
      const overflow = await platform.detectOverflow(state);
      const offsets = getSideOffsets(overflow, rects.reference);
      return {
        data: {
          referenceHiddenOffsets: offsets,
          referenceHidden: isAnySideFullyClipped(offsets),
        },
      };
    },
  };
};
