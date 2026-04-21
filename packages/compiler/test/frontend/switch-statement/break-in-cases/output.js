let $1 = undefined;
switch ("greet") {
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
