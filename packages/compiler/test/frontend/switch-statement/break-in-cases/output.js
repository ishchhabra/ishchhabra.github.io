const action = "greet";
let message = undefined;
let $18_phi_23 = undefined;
$18_phi_23 = message;
switch (action) {
  case "greet": {
    $1_3 = "hello";
    $18_phi_23 = $1_3;
    break;
  }
  case "farewell": {
    $1_2 = "goodbye";
    $18_phi_23 = $1_2;
    break;
  }
  default: {
    $1_1 = "unknown action";
    $18_phi_23 = $1_1;
    break;
  }
}
console.log($18_phi_23);
