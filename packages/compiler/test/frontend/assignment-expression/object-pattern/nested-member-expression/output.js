const $23 = {
  nested: {
    value: 1,
  },
};
({ value: $23.nested.value } = {
  value: 2,
});
console.log($23.nested.value);
