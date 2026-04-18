function $0($1) {
  void navigator.clipboard.writeText($1).then(() => {
    console.log("copied");
  });
}
export { $0 as handleCopy };
