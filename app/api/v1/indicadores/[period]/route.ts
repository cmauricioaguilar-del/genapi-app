import { NextRequest, NextResponse } from "next/server";
import { autenticarToken, registrarUso } from "@/lib/apiAuth";
import { obtenerIndicadores } from "@/lib/indicadores";
import { toCSV, csvResponse } from "@/lib/csvUtils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ period: string }> }) {
  const { period } = await params;

  const auth = await autenticarToken(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!/^\d{6}$/.test(period)) {
    return NextResponse.json({ error: "Período inválido. Formato requerido: YYYYMM (ej: 202506)" }, { status: 400 });
  }

  await registrarUso(auth.empresa.id, "indicadores", period, req.headers.get("x-forwarded-for") ?? undefined);

  const indicadores = await obtenerIndicadores(period);

  const format = req.nextUrl.searchParams.get("format");
  if (format === "csv") {
    const rows = [
      { periodo: period, indicador: "uf",     valor: indicadores.uf },
      { periodo: period, indicador: "utm",    valor: indicadores.utm },
      { periodo: period, indicador: "dolar",  valor: indicadores.dolar },
      { periodo: period, indicador: "euro",   valor: indicadores.euro },
      { periodo: period, indicador: "ipc",    valor: indicadores.ipc },
    ];
    return csvResponse(toCSV(rows), `indicadores_${period}.csv`);
  }

  return NextResponse.json({
    ok: true,
    period,
    data: indicadores,
  });
}
