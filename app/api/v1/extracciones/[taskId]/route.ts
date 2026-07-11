import { NextRequest, NextResponse } from "next/server";
import { autenticarToken } from "@/lib/apiAuth";
import { obtenerExtraccion } from "@/lib/extraccion";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;

  const auth = await autenticarToken(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const extraccion = await obtenerExtraccion(taskId, auth.empresa.id);
  if (!extraccion) {
    return NextResponse.json({ error: "Tarea no encontrada." }, { status: 404 });
  }

  return NextResponse.json({
    task_id: extraccion.id,
    modulo: extraccion.modulo,
    period: extraccion.period,
    estado: extraccion.estado,
    filas: extraccion.filas,
    error: extraccion.errorMsg,
    creado_en: extraccion.creadoEn,
  });
}
