function sink(value) {
  value.inner.value = 2;
}

const inner = { value: 1 };
const outer = { inner };
sink(outer);
console.log(inner.value);
