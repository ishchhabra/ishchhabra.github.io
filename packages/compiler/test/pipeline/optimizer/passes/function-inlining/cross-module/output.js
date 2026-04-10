async function $0_0($1_0) {
  try {
    const $2_0 = await $1_0.json();
    const $3_0 = create($24_0());
    await $3_0.insert($2_0);
    return new Response("ok");
  } catch {
    return new Response("error");
  }
}
import { getDb } from "./helper.js";
