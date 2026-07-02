import { NextRequest, NextResponse } from "next/server";
import { registroAction } from "@/app/actions/auth";

export async function POST(req: NextRequest) {
  const { nombre, email, clave, plan } = await req.json();
  if (!nombre || !email || !clave) return NextResponse.json({ error: "Todos los campos son requeridos." }, { status: 400 });
  if (clave.length < 8) return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres." }, { status: 400 });
  const result = await registroAction(nombre, email, clave, plan ?? "STARTER");
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
