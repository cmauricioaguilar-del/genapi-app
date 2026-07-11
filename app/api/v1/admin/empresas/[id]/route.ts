import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";

function autenticarAdmin(req: NextRequest): boolean {
  const secret = req.headers.get("x-admin-secret");
  return !!secret && secret === (process.env.GENAPI_ADMIN_SECRET ?? "");
}

// PATCH /api/v1/admin/empresas/[id] — actualizar webhook, clave, activar/desactivar
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!autenticarAdmin(req)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body JSON requerido." }, { status: 400 });

  const updates: any = {};
  if (body.siiClave) updates.siiClaveEnc = encrypt(body.siiClave);
  if (typeof body.activa === "boolean") updates.activa = body.activa;
  if ("webhookUrl" in body) updates.webhookUrl = body.webhookUrl ?? null;
  if ("webhookSecret" in body) updates.webhookSecret = body.webhookSecret ?? null;

  const empresa = await prisma.empresa.update({
    where: { id },
    data: updates,
    select: { id: true, nombre: true, siiRut: true, apiToken: true, activa: true, webhookUrl: true },
  });

  return NextResponse.json({ ok: true, data: empresa });
}
