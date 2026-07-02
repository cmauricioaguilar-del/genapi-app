import { NextRequest, NextResponse } from "next/server";
import { loginAction } from "@/app/actions/auth";

export async function POST(req: NextRequest) {
  const { email, clave } = await req.json();
  if (!email || !clave) return NextResponse.json({ error: "Email y contraseña requeridos." }, { status: 400 });
  const result = await loginAction(email, clave);
  if ("error" in result) return NextResponse.json(result, { status: 401 });
  return NextResponse.json(result);
}
