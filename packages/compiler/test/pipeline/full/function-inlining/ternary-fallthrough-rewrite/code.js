function wrap(s) {
  return s.trim();
}

function main(content, flag) {
  return wrap(content) + (flag ? "\n" : "");
}

export default main;
