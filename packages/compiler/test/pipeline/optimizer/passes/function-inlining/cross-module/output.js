const a = async function a(a) {
  try {
    const f = await a.json();
    const j = getDb();
    await j.insert(f);
    return new Response("ok");
  } catch {
    return new Response("error");
  }
};
import { getDb } from "./helper.js";
