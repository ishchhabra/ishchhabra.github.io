function $0_0($1_0) {
  void navigator.clipboard.writeText($1_0).then(() => {
    console.log("copied");
  });
}
export { $0_0 as handleCopy };
