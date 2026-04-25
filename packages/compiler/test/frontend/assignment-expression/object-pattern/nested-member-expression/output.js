const $24 = {
  nested: {
    value: 1,
  },
};
({ value: $24.nested.value } = {
  value: 2,
});
console.log($24.nested.value);
