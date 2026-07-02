import { NextRequest, NextResponse } from "next/server";
import { autenticarToken, registrarUso } from "@/lib/apiAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ period: string }> }) {
  const { period } = await params;

  const auth = await autenticarToken(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { empresa } = auth;

  if (!/^\d{6}$/.test(period)) {
    return NextResponse.json({ error: "Período inválido. Formato requerido: YYYYMM (ej: 202606)" }, { status: 400 });
  }

  await registrarUso(empresa.id, "f29", period, req.headers.get("x-forwarded-for") ?? undefined);

  // TODO Fase 2: extraer F29 real del SII
  return NextResponse.json({
    ok: true,
    empresa: empresa.nombre,
    rut: empresa.siiRut,
    period,
    data: null,
    message: "Extracción F29 en desarrollo. Disponible próximamente.",
  });
}
