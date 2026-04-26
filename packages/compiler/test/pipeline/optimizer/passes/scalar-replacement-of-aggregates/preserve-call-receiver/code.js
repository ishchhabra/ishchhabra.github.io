function read() {
  return this.value;
}

const obj = { value: 1, m: read };
console.log(obj.m());
