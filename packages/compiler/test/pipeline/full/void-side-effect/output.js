export const handleCopy = function handleCopy(a) {
  void navigator.clipboard.writeText(a).then(() => {
    console.log("copied");
  });
};
