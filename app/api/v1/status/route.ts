import { NextRequest, NextResponse } from "next/server";
import { autenticarToken } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

const LIMITES: Record<string, number> = {
  STARTER: 3,
  PROFESIONAL: 10,
  BUSINESS: 20,
  ENTERPRISE: 999999,
};

export async function GET(req: NextRequest) {
  const auth = await autenticarToken(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { empresa, clientePlan } = auth;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const consultasHoy = await prisma.logUso.count({
    where: { empresaId: empresa.id, creadoEn: { gte: hoy } },
  });

  const limite = LIMITES[clientePlan] ?? 3;

  return NextResponse.json({
    ok: true,
    empresa: empresa.nombre,
    rut: empresa.siiRut,
    plan: clientePlan,
    consultas_hoy: consultasHoy,
    consultas_max: limite,
    consultas_restantes: Math.max(0, limite - consultasHoy),
  });
}
