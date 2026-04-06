const g = {
  a: {
    b: 1,
  },
};
const h = g?.a;
const i = g?.a?.b;
const j = g?.[0];
const k = g?.method();
const l = g?.a.b;
