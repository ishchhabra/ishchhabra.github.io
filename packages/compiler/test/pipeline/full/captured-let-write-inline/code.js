let clientTheme = "dark";

function setTheme(v) {
  clientTheme = v;
}

function toggle() {
  setTheme("light");
  return clientTheme;
}

console.log(toggle());
