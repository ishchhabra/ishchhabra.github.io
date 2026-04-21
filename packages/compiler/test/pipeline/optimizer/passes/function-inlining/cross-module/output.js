async function $0($1) {
  try {
    const $49 = await $1.json();
    await getDb().insert($49);
    return new Response("ok");
  } catch {
    return new Response("error");
  }
}
import { getDb } from "./helper.js";
