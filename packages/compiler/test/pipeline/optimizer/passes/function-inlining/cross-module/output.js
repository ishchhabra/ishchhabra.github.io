import { getDb } from "./helper.js";
async function $0_0($4_0) {
  try {
    const $5_0 = await $4_0.json();
    const $6_0 = getDb();
    await $6_0.insert($5_0);
    return new Response("ok");
  } catch {
    return new Response("error");
  }
}
