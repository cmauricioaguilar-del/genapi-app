import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ empresaId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { empresaId } = await params;

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { clienteId: true },
  });

  if (!empresa || empresa.clienteId !== session.id) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  await prisma.empresa.delete({ where: { id: empresaId } });
  return NextResponse.json({ ok: true });
}
