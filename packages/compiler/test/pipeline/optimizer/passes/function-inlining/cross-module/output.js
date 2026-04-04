const $0_0 = async function $0_0($1_0) {
  try {
    const body = await $1_0.json();
    const db = getDb();
    await db.insert(body);
    return new Response("ok");
  } catch {
    return new Response("error");
  }
};
import { getDb } from "./helper.js";
