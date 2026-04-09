const action = "greet";
let message = undefined;
let $18_phi_20 = undefined;
$18_phi_20 = message;
switch (action) {
  case "greet":
    message = "hello";
    $18_phi_20 = message;
    break;
  case "farewell":
    message = "goodbye";
    $18_phi_20 = message;
    break;
  default:
    message = "unknown action";
    $18_phi_20 = message;
    break;
}
console.log($18_phi_20);
