const obj = { a: 1 };
obj.a = 100;
const x = obj.a;
obj.a = 200;
const y = obj.a;
console.log(x, y);
