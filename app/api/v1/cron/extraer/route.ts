import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { obtenerOExtraerVentas, obtenerOExtraerCompras, obtenerOExtraerHonorarios, obtenerOExtraerF29Batch } from "@/lib/extraccion";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (secret !== (process.env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const now = new Date();
  const anio = String(now.getFullYear());
  const mesActual = now.getMonth() + 1;
  const period = `${anio}${String(mesActual).padStart(2, "0")}`;

  // Períodos del año actual hasta el mes actual (para backfill F29)
  const periodosAnio: string[] = [];
  for (let m = 1; m <= mesActual; m++) {
    periodosAnio.push(`${anio}${String(m).padStart(2, "0")}`);
  }

  const empresas = await prisma.empresa.findMany({
    where: { activa: true },
    select: { id: true, nombre: true, siiRut: true, siiClaveEnc: true },
  });

  const resultados: any[] = [];

  for (const empresa of empresas) {
    const resultado: any = { empresa: empresa.nombre, rut: empresa.siiRut, period };
    try {
      // Secuencial para evitar múltiples sesiones SII simultáneas por RUT
      const rv = await obtenerOExtraerVentas(empresa.id, empresa.siiRut, empresa.siiClaveEnc, period);
      const rc = await obtenerOExtraerCompras(empresa.id, empresa.siiRut, empresa.siiClaveEnc, period);
      const rh = await obtenerOExtraerHonorarios(empresa.id, empresa.siiRut, empresa.siiClaveEnc, anio);

      // F29: batch con un solo login Playwright para todos los períodos faltantes
      const f29Results = await obtenerOExtraerF29Batch(empresa.id, empresa.siiRut, empresa.siiClaveEnc, periodosAnio);

      resultado.ventas     = rv.ok ? { ok: true, fromCache: rv.fromCache, total: rv.data?.length ?? 0 } : { ok: false, error: rv.error };
      resultado.compras    = rc.ok ? { ok: true, fromCache: rc.fromCache, total: rc.data?.length ?? 0 } : { ok: false, error: rc.error };
      resultado.honorarios = rh.ok ? { ok: true, fromCache: rh.fromCache, total: rh.data?.length ?? 0 } : { ok: false, error: rh.error };
      resultado.f29        = f29Results;
    } catch (e: any) {
      resultado.error = e.message;
    }
    resultados.push(resultado);
  }

  console.log(`Cron extraer ${period}: ${empresas.length} empresas procesadas`);
  return NextResponse.json({ ok: true, period, anio, empresas_procesadas: empresas.length, resultados });
}
