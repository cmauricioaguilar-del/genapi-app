export interface WebhookPayload {
  event: "extraction_complete";
  module: string;
  period: string;
  status: "SUCCESS" | "FAILED";
  rut: string;
  filas?: number | null;
  task_id: string;
  error?: string | null;
}

export function fireWebhook(url: string, secret: string | null | undefined, payload: WebhookPayload): void {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["x-webhook-secret"] = secret;

  fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  }).catch((e) => console.error(`Webhook error [${url}]:`, e.message));
}
