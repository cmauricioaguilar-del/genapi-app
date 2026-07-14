import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { crearCliente, crearSuscripcion, PLANES } from "@/lib/flow";

// POST /api/flow/checkout  body: { plan: "STARTER" | "PROFESIONAL" | "BUSINESS" }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { plan } = await req.json();
  const planDef = PLANES[plan as string];
  if (!planDef) return NextResponse.json({ error: "Plan inválido" }, { status: 400 });

  const cliente = await prisma.cliente.findUnique({ where: { id: session.id } });
  if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  let flowCustomerId = cliente.flowCustomerId ?? undefined;

  // Crear cliente en Flow si no existe
  if (!flowCustomerId) {
    const { customerId } = await crearCliente(cliente.email, cliente.nombre);
    flowCustomerId = customerId;
    await prisma.cliente.update({ where: { id: cliente.id }, data: { flowCustomerId } });
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://genapi.cl";

  const { subscriptionId, url } = await crearSuscripcion({
    customerId: flowCustomerId,
    planId: planDef.flowPlanId,
    urlReturn: `${base}/dashboard/billing?status=pending`,
  });

  await prisma.cliente.update({
    where: { id: cliente.id },
    data: { flowSubscriptionId: subscriptionId },
  });

  return NextResponse.json({ ok: true, url });
}
