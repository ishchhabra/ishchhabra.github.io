import { getDb } from "./helper.js";
async function $0_0($3_0) {
  try {
    const $4_0 = await $3_0.json();
    const $5_0 = getDb();
    await $5_0.insert($4_0);
    return new Response("ok");
  } catch {
    return new Response("error");
  }
}
