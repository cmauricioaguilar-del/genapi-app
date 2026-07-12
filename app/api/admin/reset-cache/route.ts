import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const empresaId = req.nextUrl.searchParams.get("empresaId");
  const period = req.nextUrl.searchParams.get("period");

  const where: any = { modulo: { in: ["ventas", "compras"] }, estado: "SUCCESS" };
  if (empresaId) where.empresaId = empresaId;
  if (period) where.period = period;

  // Obtener IDs de extracciones a borrar
  const extracciones = await prisma.extraccion.findMany({ where, select: { id: true } });
  const ids = extracciones.map(e => e.id);

  if (ids.length === 0) return NextResponse.json({ ok: true, eliminadas: 0 });

  // Borrar hijos primero, luego las extracciones
  await prisma.venta.deleteMany({ where: { extraccionId: { in: ids } } });
  await prisma.compra.deleteMany({ where: { extraccionId: { in: ids } } });
  await prisma.extraccion.deleteMany({ where: { id: { in: ids } } });

  return NextResponse.json({ ok: true, eliminadas: ids.length });
}
