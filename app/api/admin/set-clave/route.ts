import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== (process.env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { empresaId, clave } = await req.json();
  if (!empresaId || !clave) {
    return NextResponse.json({ error: "empresaId y clave requeridos." }, { status: 400 });
  }

  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { id: true, nombre: true } });
  if (!empresa) return NextResponse.json({ error: "Empresa no encontrada." }, { status: 404 });

  const siiClaveEnc = encrypt(clave);
  await prisma.empresa.update({ where: { id: empresaId }, data: { siiClaveEnc } });

  return NextResponse.json({ ok: true, empresa: empresa.nombre });
}
