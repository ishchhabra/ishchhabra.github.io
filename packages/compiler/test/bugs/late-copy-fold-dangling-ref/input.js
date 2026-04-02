// Bug 2: LateCopyFolding removes StoreLocal with remaining users
// The `sanitized` variable is used in the if-condition AND the replace call,
// but the fold only counts LoadLocal/LoadPhi instructions. Member expression
// reads through the identifier's uses set are not counted, so the fold
// incorrectly removes the StoreLocal, leaving dangling references.

function sanitizePath(path) {
  let sanitized = path.replace(/[\x00-\x1f\x7f]/g, "");
  if (sanitized.startsWith("//")) {
    sanitized = "/" + sanitized.replace(/^\/+/, "");
  }
  return sanitized;
}

function parseHref(href) {
  const result = sanitizePath(href);
  return result;
}

export { sanitizePath, parseHref };
