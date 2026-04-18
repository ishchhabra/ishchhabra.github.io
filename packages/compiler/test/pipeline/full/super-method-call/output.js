class $0 {
  greet() {
    return "a";
  }
}
class $1 extends $0 {
  greet() {
    return super.greet() + "b";
  }
}
new $1().greet();
