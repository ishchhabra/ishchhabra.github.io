const a = async function a(a) {
  try {
    const c = await a.json();
    const d = getDb();
    await d.insert(c);
    return new Response("ok");
  } catch {
    return new Response("error");
  }
};
import { getDb } from "./helper.js";
