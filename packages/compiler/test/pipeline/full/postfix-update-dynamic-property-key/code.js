let i = 0;
const queued = ["effect", "next"];
queued[i++] = undefined;
console.log(i, queued[0], queued[1]);
