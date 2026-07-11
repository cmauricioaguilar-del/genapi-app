import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";

function autenticarAdmin(req: NextRequest): boolean {
  const secret = req.headers.get("x-admin-secret");
  return !!secret && secret === (process.env.GENAPI_ADMIN_SECRET ?? "");
}

// GET /api/v1/admin/empresas — listar todas las empresas activas
export async function GET(req: NextRequest) {
  if (!autenticarAdmin(req)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const empresas = await prisma.empresa.findMany({
    select: {
      id: true, nombre: true, siiRut: true, apiToken: true, activa: true,
      webhookUrl: true, creadoEn: true,
      cliente: { select: { nombre: true, email: true, plan: true } },
      _count: { select: { logsUso: true } },
    },
    orderBy: { creadoEn: "desc" },
  });

  return NextResponse.json({ ok: true, total: empresas.length, data: empresas });
}
