let i = {
  nested: {
    value: 1,
  },
};
const { value: p } = {
  value: 2,
};
i.nested.value = p;
console.log(i.nested.value);
