import { NextRequest, NextResponse } from "next/server";
import { autenticarToken } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ period: string }> }) {
  const { period } = await params;

  const auth = await autenticarToken(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { empresa } = auth;

  if (!/^\d{6}$/.test(period)) {
    return NextResponse.json({ error: "Período inválido. Formato: YYYYMM" }, { status: 400 });
  }

  const f29 = await prisma.f29Genapi.findFirst({
    where: { empresaId: empresa.id, period },
    select: { pdfBytes: true },
  });

  if (!f29 || !f29.pdfBytes) {
    return NextResponse.json({ error: "PDF no disponible para este período." }, { status: 404 });
  }

  return new NextResponse(f29.pdfBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="F29_${period}.pdf"`,
      "Content-Length": String(f29.pdfBytes.length),
    },
  });
}
