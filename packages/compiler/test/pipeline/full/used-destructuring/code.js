const { a, b } = { a: 1, b: 2 };
({ a } = { a: 3 });
console.log(a + b);
