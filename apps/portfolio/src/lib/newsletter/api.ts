export interface SubscribeResponse {
  ok: boolean;
}

export interface SubscribeError {
  error: string;
}

export async function subscribe(email: string): Promise<SubscribeResponse> {
  const res = await fetch("/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    const data: SubscribeError = await res.json();
    throw new Error(data.error ?? "Something went wrong");
  }

  return res.json();
}
