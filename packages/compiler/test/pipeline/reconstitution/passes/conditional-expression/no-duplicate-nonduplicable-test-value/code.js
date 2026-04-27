const raw = sessionStorage.getItem("k");
const parsed = JSON.parse(raw ? raw : "{}");
const labeled = raw ? raw + "!" : "missing";
console.log(parsed, labeled);
