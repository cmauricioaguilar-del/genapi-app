import { NextRequest, NextResponse } from "next/server";
import { autenticarToken, registrarUso } from "@/lib/apiAuth";
import { obtenerOExtraerHonorarios } from "@/lib/extraccion";
import { toCSV, csvResponse } from "@/lib/csvUtils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ anio: string }> }) {
  const { anio } = await params;

  const auth = await autenticarToken(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { empresa } = auth;

  if (!/^\d{4}$/.test(anio)) {
    return NextResponse.json({ error: "Año inválido. Formato requerido: YYYY (ej: 2025)" }, { status: 400 });
  }

  await registrarUso(empresa.id, "honorarios", anio, req.headers.get("x-forwarded-for") ?? undefined);

  const resultado = await obtenerOExtraerHonorarios(empresa.id, empresa.siiRut, empresa.siiClaveEnc, anio);

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: 502 });
  }

  const data = resultado.data ?? [];
  const format = req.nextUrl.searchParams.get("format");
  if (format === "csv") {
    const rows = data.map((d: any) => ({
      anio: d.anio,
      mes: d.mes,
      folio: d.folio,
      fecha_emision: d.fechaEmision,
      rut_emisor: d.rutEmisor,
      nombre_emisor: d.nombreEmisor,
      monto_bruto: d.montoBruto,
      retencion: d.retencion,
      monto_liquido: d.montoLiquido,
    }));
    return csvResponse(toCSV(rows), `honorarios_${anio}.csv`);
  }

  return NextResponse.json({
    ok: true,
    empresa: empresa.nombre,
    rut: empresa.siiRut,
    anio,
    fromCache: resultado.fromCache ?? false,
    total: data.length,
    data,
  });
}
