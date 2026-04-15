function make() {
  let location = { pathname: "/" };
  return {
    get location() {
      return location;
    },
  };
}
