import { prisma } from "./db";
import type { Empresa } from "@prisma/client";

const LIMITES: Record<string, number> = {
  STARTER: 3,
  PROFESIONAL: 10,
  BUSINESS: 20,
  ENTERPRISE: 999999,
};

export async function autenticarToken(request: Request): Promise<
  { empresa: Empresa; clientePlan: string } | { error: string; status: number }
> {
  const token = request.headers.get("X-Api-Token");
  if (!token) return { error: "Token requerido. Incluye el header X-Api-Token.", status: 401 };

  const empresa = await prisma.empresa.findUnique({
    where: { apiToken: token },
    include: { cliente: true },
  });

  if (!empresa || !empresa.activa) return { error: "Token inválido o empresa inactiva.", status: 401 };
  if (!empresa.cliente.activo) return { error: "Cuenta suspendida.", status: 403 };

  const plan = empresa.cliente.plan;
  const limite = LIMITES[plan] ?? 3;

  // Contar consultas de hoy
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const consultasHoy = await prisma.logUso.count({
    where: { empresaId: empresa.id, creadoEn: { gte: hoy } },
  });

  if (consultasHoy >= limite) {
    return {
      error: `Límite diario alcanzado (${limite} consultas/día en plan ${plan}). Actualiza tu plan en genapi.cl`,
      status: 429,
    };
  }

  return { empresa, clientePlan: plan };
}

export async function registrarUso(empresaId: string, endpoint: string, period?: string, ip?: string) {
  await prisma.logUso.create({ data: { empresaId, endpoint, period, ip } });
}
