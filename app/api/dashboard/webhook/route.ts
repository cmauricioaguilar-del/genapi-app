import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET: obtener config webhook de la primera empresa del cliente
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresa = await prisma.empresa.findFirst({
    where: { clienteId: session.id },
    select: { id: true, webhookUrl: true, webhookSecret: true },
  });

  return NextResponse.json({ webhookUrl: empresa?.webhookUrl ?? "", webhookSecret: empresa?.webhookSecret ?? "" });
}

// POST: guardar config webhook
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { webhookUrl, webhookSecret, empresaId } = await req.json();

  if (webhookUrl && !/^https?:\/\/.+/.test(webhookUrl)) {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }

  // Verificar que la empresa pertenece al cliente
  const empresa = await prisma.empresa.findFirst({
    where: { id: empresaId, clienteId: session.id },
    select: { id: true },
  });
  if (!empresa) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });

  await prisma.empresa.update({
    where: { id: empresa.id },
    data: { webhookUrl: webhookUrl || null, webhookSecret: webhookSecret || null },
  });

  return NextResponse.json({ ok: true });
}
