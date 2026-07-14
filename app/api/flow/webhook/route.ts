import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validarWebhookSign, obtenerSuscripcion, PLANES } from "@/lib/flow";

// Flow envía POST con form-urlencoded
export async function POST(req: NextRequest) {
  const body = await req.text();
  const params = Object.fromEntries(new URLSearchParams(body));

  if (!validarWebhookSign(params)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  const { subscriptionId, event } = params;
  if (!subscriptionId) return NextResponse.json({ ok: true }); // ignorar eventos sin suscripción

  const cliente = await prisma.cliente.findFirst({ where: { flowSubscriptionId: subscriptionId } });
  if (!cliente) return NextResponse.json({ ok: true });

  if (event === "subscription_paid" || event === "subscription_created") {
    const sub = await obtenerSuscripcion(subscriptionId);

    // Determinar el plan a partir del planId de Flow
    const planEntry = Object.entries(PLANES).find(([, v]) => v.flowPlanId === sub.planId);
    const plan = planEntry ? planEntry[0] : cliente.plan;

    const vencimiento = sub.nextPaymentDate
      ? new Date(sub.nextPaymentDate)
      : new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);

    await prisma.cliente.update({
      where: { id: cliente.id },
      data: { plan, planVencimiento: vencimiento, activo: true },
    });
  }

  if (event === "subscription_canceled" || event === "subscription_expired") {
    await prisma.cliente.update({
      where: { id: cliente.id },
      data: { plan: "TRIAL", planVencimiento: null },
    });
  }

  return NextResponse.json({ ok: true });
}
