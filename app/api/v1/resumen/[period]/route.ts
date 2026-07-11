import { NextRequest, NextResponse } from "next/server";
import { autenticarToken, registrarUso } from "@/lib/apiAuth";
import { obtenerOExtraerVentas, obtenerOExtraerCompras, obtenerOExtraerHonorarios } from "@/lib/extraccion";
import { calcularResumen } from "@/lib/resumen";
import { toCSV, csvResponse } from "@/lib/csvUtils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ period: string }> }) {
  const { period } = await params;

  const auth = await autenticarToken(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { empresa } = auth;

  if (!/^\d{6}$/.test(period)) {
    return NextResponse.json({ error: "Período inválido. Formato requerido: YYYYMM (ej: 202506)" }, { status: 400 });
  }

  await registrarUso(empresa.id, "resumen", period, req.headers.get("x-forwarded-for") ?? undefined);

  const anio = period.slice(0, 4);

  // Extraer los tres módulos si no están en caché (en paralelo)
  const [rv, rc, rh] = await Promise.all([
    obtenerOExtraerVentas(empresa.id, empresa.siiRut, empresa.siiClaveEnc, period),
    obtenerOExtraerCompras(empresa.id, empresa.siiRut, empresa.siiClaveEnc, period),
    obtenerOExtraerHonorarios(empresa.id, empresa.siiRut, empresa.siiClaveEnc, anio),
  ]);

  if (!rv.ok) return NextResponse.json({ error: `Ventas: ${rv.error}` }, { status: 502 });
  if (!rc.ok) return NextResponse.json({ error: `Compras: ${rc.error}` }, { status: 502 });
  if (!rh.ok) return NextResponse.json({ error: `Honorarios: ${rh.error}` }, { status: 502 });

  const resumen = await calcularResumen(empresa.id, period);

  const format = req.nextUrl.searchParams.get("format");
  if (format === "csv") {
    const rows = [
      { modulo: "ventas", campo: "total_docs", valor: resumen.ventas.total_docs },
      { modulo: "ventas", campo: "monto_neto", valor: resumen.ventas.monto_neto },
      { modulo: "ventas", campo: "monto_iva", valor: resumen.ventas.monto_iva },
      { modulo: "ventas", campo: "monto_total", valor: resumen.ventas.monto_total },
      { modulo: "ventas", campo: "monto_exento", valor: resumen.ventas.monto_exento },
      { modulo: "compras", campo: "total_docs", valor: resumen.compras.total_docs },
      { modulo: "compras", campo: "monto_neto", valor: resumen.compras.monto_neto },
      { modulo: "compras", campo: "monto_iva", valor: resumen.compras.monto_iva },
      { modulo: "compras", campo: "monto_total", valor: resumen.compras.monto_total },
      { modulo: "compras", campo: "monto_exento", valor: resumen.compras.monto_exento },
      { modulo: "honorarios", campo: "total_docs", valor: resumen.honorarios.total_docs },
      { modulo: "honorarios", campo: "monto_bruto", valor: resumen.honorarios.monto_bruto },
      { modulo: "honorarios", campo: "retencion", valor: resumen.honorarios.retencion },
      { modulo: "honorarios", campo: "monto_liquido", valor: resumen.honorarios.monto_liquido },
      { modulo: "resultado", campo: "iva_neto", valor: resumen.iva_neto },
      { modulo: "resultado", campo: "retencion_total", valor: resumen.retencion_total },
    ];
    return csvResponse(toCSV(rows), `resumen_${period}.csv`);
  }

  return NextResponse.json({
    ok: true,
    empresa: empresa.nombre,
    rut: empresa.siiRut,
    period,
    resumen,
  });
}
