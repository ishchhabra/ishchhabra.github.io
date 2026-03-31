const finite = Number.isFinite(parseFloat("3.5"));
const coercedFinite = isFinite("4");
const rounded = Math.floor(4.9);
const parsed = parseInt("10", 10);
const nan = Number.isNaN(NaN);
const objectIs = Object.is(-0, -0);
const integer = Number.isInteger(8);
const safeInteger = Number.isSafeInteger(42);
const max = Math.max(1, 7, 3);
const power = Math.pow(2, 5);
const chars = String.fromCharCode(65, 66);
const uri = encodeURIComponent("a b");
const parsedDate = Date.parse("1970-01-01T00:00:00.000Z");
const parsedJson = JSON.parse("true");
const casted = Number("5");
console.log(
  finite,
  coercedFinite,
  rounded,
  parsed,
  nan,
  objectIs,
  integer,
  safeInteger,
  max,
  power,
  chars,
  uri,
  parsedDate,
  parsedJson,
  casted,
);
