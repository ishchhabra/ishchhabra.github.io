export const handleCopy = function handleCopy($1_0) {
  void navigator.clipboard.writeText($1_0).then(() => {
    console.log("copied");
  });
};
