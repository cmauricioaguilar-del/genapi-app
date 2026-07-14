import crypto from "crypto";

const FLOW_API = process.env.FLOW_ENV === "sandbox"
  ? "https://sandbox.flow.cl/api"
  : "https://www.flow.cl/api";

const API_KEY    = process.env.FLOW_API_KEY!;
const SECRET_KEY = process.env.FLOW_SECRET_KEY!;

export const PLANES: Record<string, { flowPlanId: string; nombre: string; precio: number; empresas: number }> = {
  STARTER:      { flowPlanId: process.env.FLOW_PLAN_STARTER!,      nombre: "Starter",      precio: 24900, empresas: 1 },
  PROFESIONAL:  { flowPlanId: process.env.FLOW_PLAN_PROFESIONAL!,  nombre: "Profesional",  precio: 44900, empresas: 5 },
  BUSINESS:     { flowPlanId: process.env.FLOW_PLAN_BUSINESS!,     nombre: "Business",     precio: 59900, empresas: 10 },
};

function sign(params: Record<string, string>): string {
  const sorted = Object.keys(params).sort().map(k => `${k}${params[k]}`).join("");
  return crypto.createHmac("sha256", SECRET_KEY).update(sorted).digest("hex");
}

async function flowPost(service: string, body: Record<string, string>): Promise<any> {
  const params = { ...body, apiKey: API_KEY };
  params.s = sign(params);

  const form = new URLSearchParams(params);
  const res = await fetch(`${FLOW_API}/${service}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  return res.json();
}

async function flowGet(service: string, query: Record<string, string>): Promise<any> {
  const params = { ...query, apiKey: API_KEY };
  params.s = sign(params);
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${FLOW_API}/${service}?${qs}`);
  return res.json();
}

export async function crearCliente(email: string, nombre: string): Promise<{ customerId: string }> {
  const data = await flowPost("customer/create", { email, name: nombre, externalId: email });
  if (data.code) throw new Error(`Flow error ${data.code}: ${data.message}`);
  return { customerId: data.customerId };
}

export async function crearSuscripcion(params: {
  customerId: string;
  planId: string;
  trialPeriodDays?: number;
  urlReturn: string;
  urlConfirmation?: string;
}): Promise<{ subscriptionId: string; url: string }> {
  const body: Record<string, string> = {
    customerId: params.customerId,
    planId: params.planId,
    urlReturn: params.urlReturn,
    urlConfirmation: params.urlConfirmation ?? params.urlReturn.replace("/billing?status=pending", "/api/flow/webhook"),
  };
  if (params.trialPeriodDays) body.trialPeriodDays = String(params.trialPeriodDays);

  const data = await flowPost("subscription/create", body);
  if (data.code) throw new Error(`Flow error ${data.code}: ${data.message}`);
  return { subscriptionId: data.subscriptionId, url: data.url };
}

export async function cancelarSuscripcion(subscriptionId: string): Promise<void> {
  await flowPost("subscription/cancel", { subscriptionId });
}

export async function obtenerSuscripcion(subscriptionId: string): Promise<any> {
  return flowGet("subscription/get", { subscriptionId });
}

export function validarWebhookSign(params: Record<string, string>): boolean {
  const { s, ...rest } = params;
  const expected = sign(rest as Record<string, string>);
  return s === expected;
}
