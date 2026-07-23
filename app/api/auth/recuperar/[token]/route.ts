import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

// POST /api/auth/recuperar/[token] — restablecer clave
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { clave } = await req.json().catch(() => ({}));

  if (!clave || typeof clave !== "string" || clave.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres." }, { status: 400 });
  }

  const registro = await prisma.tokenRecuperacion.findUnique({ where: { token } });

  if (!registro || registro.usado || registro.expiraEn < new Date()) {
    return NextResponse.json({ error: "El enlace no es válido o ha expirado." }, { status: 400 });
  }

  const claveHash = await bcrypt.hash(clave, 12);

  await prisma.cliente.update({
    where: { email: registro.email },
    data: { claveHash },
  });

  await prisma.tokenRecuperacion.update({
    where: { token },
    data: { usado: true },
  });

  return NextResponse.json({ ok: true, mensaje: "Contraseña actualizada correctamente." });
}
