async function $0($1) {
  try {
    await getDb().insert(await $1.json());
    return new Response("ok");
  } catch {
    return new Response("error");
  }
}
import { getDb } from "./helper.js";
