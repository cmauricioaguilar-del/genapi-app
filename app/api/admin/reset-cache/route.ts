import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Borra las extracciones cacheadas para forzar re-extracción
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const empresaId = req.nextUrl.searchParams.get("empresaId");
  const period = req.nextUrl.searchParams.get("period");

  const where: any = { modulo: { in: ["ventas", "compras"] }, estado: "SUCCESS" };
  if (empresaId) where.empresaId = empresaId;
  if (period) where.period = period;

  const deleted = await prisma.extraccion.deleteMany({ where });

  return NextResponse.json({ ok: true, eliminadas: deleted.count });
}
