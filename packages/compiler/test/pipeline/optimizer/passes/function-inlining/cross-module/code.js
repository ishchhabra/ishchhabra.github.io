import { getDb } from "./helper.js";

async function handler(request) {
  try {
    const body = await request.json();
    const db = getDb();
    await db.insert(body);
    return new Response("ok");
  } catch {
    return new Response("error");
  }
}
