let $0 = {
  nested: {
    value: 1,
  },
};
({ value: $0.nested.value } = {
  value: 2,
});
console.log($0.nested.value);
