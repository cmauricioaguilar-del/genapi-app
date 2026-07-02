import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

const MAX_EMPRESAS: Record<string, number> = { STARTER: 1, PROFESIONAL: 5, BUSINESS: 10, ENTERPRISE: 9999 };

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { nombre, rut, siiRut, siiClave } = await req.json();
  if (!nombre || !rut || !siiRut || !siiClave) {
    return NextResponse.json({ error: "Todos los campos son requeridos." }, { status: 400 });
  }

  const cliente = await prisma.cliente.findUnique({
    where: { id: session.id },
    include: { _count: { select: { empresas: true } } },
  });
  if (!cliente) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

  const max = MAX_EMPRESAS[cliente.plan] ?? 1;
  if (cliente._count.empresas >= max) {
    return NextResponse.json({ error: `Tu plan ${cliente.plan} permite máximo ${max} empresa(s). Actualiza tu plan.` }, { status: 403 });
  }

  const siiClaveEnc = encrypt(siiClave);

  const empresa = await prisma.empresa.create({
    data: { nombre, rut, siiRut, siiClaveEnc, clienteId: session.id },
  });

  return NextResponse.json({ ok: true, apiToken: empresa.apiToken, empresa: empresa.nombre });
}
