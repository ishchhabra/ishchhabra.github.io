class $0_0 {
  greet() {
    return "a";
  }
}
class $1_0 extends $0_0 {
  greet() {
    return super.greet() + "b";
  }
}
new $1_0().greet();
