import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enviarMailRecuperacion } from "@/lib/mail";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

// POST /api/auth/recuperar — solicitar recuperación de clave
export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email requerido." }, { status: 400 });
  }

  // Siempre responde igual para no revelar si el email existe
  const cliente = await prisma.cliente.findUnique({ where: { email: email.toLowerCase().trim() } });

  if (cliente) {
    const token = uuidv4();
    const expiraEn = new Date(Date.now() + 60 * 60 * 1000);

    try {
      await prisma.tokenRecuperacion.create({
        data: { email: cliente.email, token, expiraEn },
      });
      console.log("[recuperar] Token creado para:", cliente.email);
    } catch (e) {
      console.error("[recuperar] Error creando token en DB:", e);
      return NextResponse.json({ ok: true, mensaje: "Si el email está registrado, recibirás un enlace." });
    }

    try {
      await enviarMailRecuperacion(cliente.email, token);
      console.log("[recuperar] Mail enviado a:", cliente.email);
    } catch (e) {
      console.error("[recuperar] Error enviando mail SMTP:", e);
    }
  } else {
    console.log("[recuperar] Email no encontrado en DB:", email);
  }

  return NextResponse.json({
    ok: true,
    mensaje: "Si el email está registrado, recibirás un enlace para restablecer tu contraseña.",
  });
}
