import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const tipos = await prisma.venta.groupBy({
    by: ["docType", "empresaId"],
    _count: { id: true },
    orderBy: { empresaId: "asc" },
  });

  const empresas = await prisma.empresa.findMany({
    select: { id: true, nombre: true },
  });

  const nombrePorId = Object.fromEntries(empresas.map(e => [e.id, e.nombre]));

  const resultado = tipos.map(t => ({
    empresa: nombrePorId[t.empresaId] ?? t.empresaId,
    docType: t.docType,
    cantidad: t._count.id,
  }));

  return NextResponse.json({ ok: true, resultado });
}
