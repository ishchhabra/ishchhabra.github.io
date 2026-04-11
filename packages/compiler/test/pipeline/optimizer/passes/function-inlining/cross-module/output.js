async function $0_0($1_0) {
  try {
    await create($24_0()).insert(await $1_0.json());
    return new Response("ok");
  } catch {
    return new Response("error");
  }
}
import { getDb } from "./helper.js";
