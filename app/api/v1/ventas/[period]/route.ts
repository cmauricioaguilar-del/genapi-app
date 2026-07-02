import { NextRequest, NextResponse } from "next/server";
import { autenticarToken, registrarUso } from "@/lib/apiAuth";
import { extraerRCV } from "@/lib/sii";

export async function GET(req: NextRequest, { params }: { params: Promise<{ period: string }> }) {
  const { period } = await params;

  const auth = await autenticarToken(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { empresa } = auth;

  if (!/^\d{6}$/.test(period)) {
    return NextResponse.json({ error: "Período inválido. Formato requerido: YYYYMM (ej: 202606)" }, { status: 400 });
  }

  await registrarUso(empresa.id, "ventas", period, req.headers.get("x-forwarded-for") ?? undefined);

  const resultado = await extraerRCV(empresa.siiRut, empresa.siiClaveEnc, period);

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    empresa: empresa.nombre,
    rut: empresa.siiRut,
    period,
    total: resultado.ventas?.length ?? 0,
    data: resultado.ventas,
  });
}
