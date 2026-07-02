import { NextRequest, NextResponse } from "next/server";
import { autenticarToken, registrarUso } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ period: string }> }) {
  const { period } = await params;

  const auth = await autenticarToken(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { empresa } = auth;

  if (!/^\d{6}$/.test(period)) {
    return NextResponse.json({ error: "Período inválido. Formato requerido: YYYYMM (ej: 202606)" }, { status: 400 });
  }

  await registrarUso(empresa.id, "extraer", period, req.headers.get("x-forwarded-for") ?? undefined);

  const extraccion = await prisma.extraccion.create({
    data: {
      empresaId: empresa.id,
      period,
      modulo: "ventas_compras",
      estado: "PENDIENTE",
    },
  });

  // TODO Fase 2: encolar extracción asíncrona

  return NextResponse.json({
    ok: true,
    message: "Extracción encolada. Los datos estarán disponibles en aprox. 2 minutos.",
    job_id: extraccion.id,
    period,
  });
}
