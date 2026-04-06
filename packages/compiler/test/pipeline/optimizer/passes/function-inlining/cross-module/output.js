const a = async function a(a) {
  try {
    const h = await a.json();
    const l = getDb();
    await l.insert(h);
    return new Response("ok");
  } catch {
    return new Response("error");
  }
};
import { getDb } from "./helper.js";
