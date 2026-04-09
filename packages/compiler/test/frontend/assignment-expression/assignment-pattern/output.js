let a = undefined;
let b = undefined;
[a = 1, b = 2] = [];
let c = undefined;
({ c = 3 } = {});
let e = undefined;
[{ e = "default" } = {}] = [];
