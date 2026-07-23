import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Eliminar extracciones del módulo obsoleto ventas_compras
  const deleted = await prisma.extraccion.deleteMany({
    where: { modulo: "ventas_compras" },
  });

  return NextResponse.json({ ok: true, eliminadas: deleted.count });
}
