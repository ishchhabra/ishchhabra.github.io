const action = "greet";
let message;
switch (action) {
  case "greet":
    message = "hello";
    break;
  case "farewell":
    message = "goodbye";
    break;
  default:
    message = "unknown action";
}
console.log(message);
