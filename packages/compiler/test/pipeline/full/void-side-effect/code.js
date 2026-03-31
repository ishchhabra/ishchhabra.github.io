export function handleCopy(text) {
  void navigator.clipboard.writeText(text).then(() => {
    console.log("copied");
  });
}
