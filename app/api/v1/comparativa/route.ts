import { NextRequest, NextResponse } from "next/server";
import { autenticarToken, registrarUso } from "@/lib/apiAuth";
import { obtenerOExtraerVentas, obtenerOExtraerCompras, obtenerOExtraerHonorarios } from "@/lib/extraccion";
import { calcularResumen } from "@/lib/resumen";
import { toCSV, csvResponse } from "@/lib/csvUtils";

export const dynamic = "force-dynamic";

// GET /api/v1/comparativa?periods=202501,202502,202503
export async function GET(req: NextRequest) {
  const auth = await autenticarToken(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { empresa } = auth;

  const periodsParam = req.nextUrl.searchParams.get("periods");
  if (!periodsParam) {
    return NextResponse.json({ error: "Parámetro 'periods' requerido. Ej: ?periods=202501,202502,202503" }, { status: 400 });
  }

  const periods = periodsParam.split(",").map((p) => p.trim());

  if (periods.length < 2 || periods.length > 12) {
    return NextResponse.json({ error: "Debes indicar entre 2 y 12 períodos." }, { status: 400 });
  }

  for (const p of periods) {
    if (!/^\d{6}$/.test(p)) {
      return NextResponse.json({ error: `Período inválido: ${p}. Formato requerido: YYYYMM` }, { status: 400 });
    }
  }

  await registrarUso(empresa.id, "comparativa", periods.join(","), req.headers.get("x-forwarded-for") ?? undefined);

  // Extraer datos de todos los períodos en paralelo
  await Promise.all(
    periods.flatMap((period) => {
      const anio = period.slice(0, 4);
      return [
        obtenerOExtraerVentas(empresa.id, empresa.siiRut, empresa.siiClaveEnc, period),
        obtenerOExtraerCompras(empresa.id, empresa.siiRut, empresa.siiClaveEnc, period),
        obtenerOExtraerHonorarios(empresa.id, empresa.siiRut, empresa.siiClaveEnc, anio),
      ];
    })
  );

  const resumenes = await Promise.all(periods.map((p) => calcularResumen(empresa.id, p)));

  const format = req.nextUrl.searchParams.get("format");
  if (format === "csv") {
    const rows = resumenes.flatMap((r) => [
      { period: r.period, modulo: "ventas", campo: "total_docs", valor: r.ventas.total_docs },
      { period: r.period, modulo: "ventas", campo: "monto_neto", valor: r.ventas.monto_neto },
      { period: r.period, modulo: "ventas", campo: "monto_iva", valor: r.ventas.monto_iva },
      { period: r.period, modulo: "ventas", campo: "monto_total", valor: r.ventas.monto_total },
      { period: r.period, modulo: "compras", campo: "total_docs", valor: r.compras.total_docs },
      { period: r.period, modulo: "compras", campo: "monto_neto", valor: r.compras.monto_neto },
      { period: r.period, modulo: "compras", campo: "monto_iva", valor: r.compras.monto_iva },
      { period: r.period, modulo: "compras", campo: "monto_total", valor: r.compras.monto_total },
      { period: r.period, modulo: "honorarios", campo: "monto_bruto", valor: r.honorarios.monto_bruto },
      { period: r.period, modulo: "honorarios", campo: "retencion", valor: r.honorarios.retencion },
      { period: r.period, modulo: "resultado", campo: "iva_neto", valor: r.iva_neto },
    ]);
    return csvResponse(toCSV(rows), `comparativa_${periods[0]}_${periods[periods.length - 1]}.csv`);
  }

  return NextResponse.json({
    ok: true,
    empresa: empresa.nombre,
    rut: empresa.siiRut,
    periods,
    data: resumenes,
  });
}
