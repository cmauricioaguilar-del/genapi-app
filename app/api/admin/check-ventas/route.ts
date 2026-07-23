import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const empresaId = req.nextUrl.searchParams.get("empresaId");
  const period    = req.nextUrl.searchParams.get("period");

  if (!empresaId || !period) {
    return NextResponse.json({ error: "Faltan parámetros empresaId y period" }, { status: 400 });
  }

  const extracciones = await prisma.extraccion.findMany({
    where: { empresaId, period, modulo: { in: ["ventas", "compras"] } },
    orderBy: { creadoEn: "desc" },
    select: { id: true, modulo: true, estado: true, filas: true, creadoEn: true, errorMsg: true },
  });

  const ventas = await prisma.venta.count({ where: { empresaId, period } });
  const compras = await prisma.compra.count({ where: { empresaId, period } });

  return NextResponse.json({ ok: true, period, empresaId, extracciones, ventasEnDB: ventas, comprasEnDB: compras });
}
