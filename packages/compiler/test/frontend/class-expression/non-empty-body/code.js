class Foo extends Base {
  constructor(x) {
    super(x);
    this.value = x;
  }
}

export const foo = new Foo(1);
