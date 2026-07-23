import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { obtenerOExtraerF29Batch } from "@/lib/extraccion";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== (process.env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  // Listar empresas si se pasa ?list=1
  if (req.nextUrl.searchParams.get("list") === "1") {
    const empresas = await prisma.empresa.findMany({ select: { id: true, nombre: true, siiRut: true } });
    return NextResponse.json({ empresas });
  }

  const empresaId = req.nextUrl.searchParams.get("empresaId");
  const siiRut = req.nextUrl.searchParams.get("rut");
  if (!empresaId && !siiRut) {
    return NextResponse.json({ error: "empresaId o rut requerido." }, { status: 400 });
  }

  const anio = req.nextUrl.searchParams.get("anio") ?? String(new Date().getFullYear());
  const mesesHasta = parseInt(req.nextUrl.searchParams.get("meses") ?? String(new Date().getMonth() + 1), 10);

  const empresa = await prisma.empresa.findFirst({
    where: empresaId ? { id: empresaId } : { siiRut: siiRut! },
    select: { id: true, nombre: true, siiRut: true, siiClaveEnc: true },
  });
  if (!empresa) return NextResponse.json({ error: "Empresa no encontrada." }, { status: 404 });

  const periods: string[] = [];
  for (let m = 1; m <= mesesHasta; m++) {
    periods.push(`${anio}${String(m).padStart(2, "0")}`);
  }

  console.log(`[test-f29] Empresa: ${empresa.nombre} RUT: ${empresa.siiRut} Períodos: ${periods.join(",")}`);

  const resultados = await obtenerOExtraerF29Batch(empresa.id, empresa.siiRut, empresa.siiClaveEnc, periods);

  return NextResponse.json({ ok: true, empresa: empresa.nombre, rut: empresa.siiRut, anio, periods, resultados });
}
