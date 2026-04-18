const $0 = "greet";
let $1 = undefined;
switch ($0) {
  case "greet":
    $1 = "hello";
    break;
  case "farewell":
    $1 = "goodbye";
    break;
  default:
    $1 = "unknown action";
    break;
}
console.log($1);
