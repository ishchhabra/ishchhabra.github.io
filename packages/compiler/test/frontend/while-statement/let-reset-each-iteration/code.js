const parts = ["", "writing", "ssr-theming"];
const expected = ["writing", "ssr-theming"];
const seen = [];
let index = 1;
while (index < parts.length) {
  const part = parts[index];
  let lowerPart;
  seen.push((lowerPart ??= part.toLowerCase()));
  index++;
}
const result = seen.join("/") === expected.join("/");
