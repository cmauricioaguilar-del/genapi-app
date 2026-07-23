import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { obtenerOExtraerVentas, obtenerOExtraerCompras, obtenerOExtraerHonorarios, obtenerOExtraerF29 } from "@/lib/extraccion";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (secret !== (process.env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const now = new Date();
  const anio = String(now.getFullYear());
  const mes = String(now.getMonth() + 1).padStart(2, "0");
  const period = `${anio}${mes}`;

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
      const rf = await obtenerOExtraerF29(empresa.id, empresa.siiRut, empresa.siiClaveEnc, period);

      resultado.ventas     = rv.ok ? { ok: true, fromCache: rv.fromCache, total: rv.data?.length ?? 0 } : { ok: false, error: rv.error };
      resultado.compras    = rc.ok ? { ok: true, fromCache: rc.fromCache, total: rc.data?.length ?? 0 } : { ok: false, error: rc.error };
      resultado.honorarios = rh.ok ? { ok: true, fromCache: rh.fromCache, total: rh.data?.length ?? 0 } : { ok: false, error: rh.error };
      resultado.f29        = rf.ok ? { ok: true, fromCache: rf.fromCache } : { ok: false, error: rf.error };
    } catch (e: any) {
      resultado.error = e.message;
    }
    resultados.push(resultado);
  }

  console.log(`Cron extraer ${period}: ${empresas.length} empresas procesadas`);
  return NextResponse.json({ ok: true, period, anio, empresas_procesadas: empresas.length, resultados });
}
