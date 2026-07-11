import { NextRequest, NextResponse } from "next/server";
import { autenticarToken, registrarUso } from "@/lib/apiAuth";
import { obtenerOExtraerF29 } from "@/lib/extraccion";
import { toCSV, csvResponse } from "@/lib/csvUtils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ period: string }> }) {
  const { period } = await params;

  const auth = await autenticarToken(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { empresa } = auth;

  if (!/^\d{6}$/.test(period)) {
    return NextResponse.json({ error: "Período inválido. Formato requerido: YYYYMM (ej: 202606)" }, { status: 400 });
  }

  await registrarUso(empresa.id, "f29", period, req.headers.get("x-forwarded-for") ?? undefined);

  const resultado = await obtenerOExtraerF29(empresa.id, empresa.siiRut, empresa.siiClaveEnc, period);
  if (!resultado.ok) {
    return NextResponse.json({ ok: false, error: resultado.error }, { status: 502 });
  }

  const f29 = resultado.data as any;

  const format = req.nextUrl.searchParams.get("format");
  if (format === "csv") {
    const rows = [{
      period,
      iva_debito: f29.ivaDebito,
      iva_credito: f29.ivaCredito,
      iva_remanente: f29.ivaRemanente,
      iva_neto: f29.ivaNeto,
      retencion_honorarios: f29.retencionHonorarios,
      ppm: f29.ppm,
      total_pagar: f29.totalPagar,
    }];
    return csvResponse(toCSV(rows), `f29_${period}.csv`);
  }

  return NextResponse.json({
    ok: true,
    empresa: empresa.nombre,
    rut: empresa.siiRut,
    period,
    fromCache: resultado.fromCache,
    data: {
      period,
      iva_debito: f29.ivaDebito,
      iva_credito: f29.ivaCredito,
      iva_remanente: f29.ivaRemanente,
      iva_neto: f29.ivaNeto,
      retencion_honorarios: f29.retencionHonorarios,
      ppm: f29.ppm,
      total_pagar: f29.totalPagar,
    },
  });
}
