const x = 1;
const outer = () => {
  const inner = () => x;
  return inner();
};
outer();
