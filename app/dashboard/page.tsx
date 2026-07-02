import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";

const LIMITES: Record<string, number> = { STARTER: 3, PROFESIONAL: 10, BUSINESS: 20, ENTERPRISE: 999999 };

export default async function Dashboard() {
  const session = await getSession();
  if (!session) redirect("/login");

  const cliente = await prisma.cliente.findUnique({
    where: { id: session.id },
    include: { empresas: true },
  });
  if (!cliente) redirect("/login");

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const consultasHoy = await prisma.logUso.count({
    where: { empresa: { clienteId: cliente.id }, creadoEn: { gte: hoy } },
  });
  const limite = LIMITES[cliente.plan] ?? 3;

  return (
    <main className="min-h-screen bg-[#0a1628] text-[#cdd6e8]">
      {/* HEADER */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-white/10">
        <span className="text-xl font-bold text-[#c9a84c]">GENAPI</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[#a8b4c8]">{cliente.email}</span>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="text-sm text-[#a8b4c8] hover:text-white transition">Salir</button>
          </form>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-8 py-10 space-y-8">
        {/* BIENVENIDA */}
        <div>
          <h1 className="text-2xl font-bold text-white">Hola, {cliente.nombre.split(" ")[0]}</h1>
          <p className="text-[#a8b4c8] mt-1">Plan <span className="text-[#c9a84c] font-semibold">{cliente.plan}</span></p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Empresas conectadas", valor: cliente.empresas.length, max: LIMITES[cliente.plan] <= 3 ? 1 : cliente.plan === "PROFESIONAL" ? 5 : 10 },
            { label: "Consultas hoy", valor: consultasHoy, max: limite },
            { label: "Consultas restantes", valor: Math.max(0, limite - consultasHoy), max: null },
          ].map(k => (
            <div key={k.label} className="bg-[#112240] rounded-xl p-5 border border-white/10">
              <p className="text-sm text-[#a8b4c8] mb-1">{k.label}</p>
              <p className="text-3xl font-bold text-white">{k.valor}{k.max ? <span className="text-lg text-[#a8b4c8]"> / {k.max}</span> : ""}</p>
            </div>
          ))}
        </div>

        {/* EMPRESAS */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Mis empresas</h2>
            <Link href="/dashboard/empresas/nueva" className="px-4 py-2 text-sm bg-[#c9a84c] text-[#0a1628] rounded font-semibold hover:bg-[#e4c97a] transition">
              + Agregar empresa
            </Link>
          </div>

          {cliente.empresas.length === 0 ? (
            <div className="bg-[#112240] rounded-xl p-10 border border-white/10 text-center">
              <p className="text-[#a8b4c8] mb-4">Aún no tienes empresas conectadas.</p>
              <Link href="/dashboard/empresas/nueva" className="px-6 py-3 bg-[#c9a84c] text-[#0a1628] rounded-lg font-bold hover:bg-[#e4c97a] transition">
                Conectar primera empresa
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {cliente.empresas.map((emp: { id: string; nombre: string; rut: string; apiToken: string }) => (
                <div key={emp.id} className="bg-[#112240] rounded-xl p-5 border border-white/10 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-white">{emp.nombre}</p>
                    <p className="text-sm text-[#a8b4c8]">RUT: {emp.rut}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[#a8b4c8] mb-1">Tu token de API</p>
                    <code className="text-xs bg-[#0a1628] text-[#c9a84c] px-3 py-1 rounded border border-white/10">
                      {emp.apiToken}
                    </code>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* DOCS RÁPIDA */}
        <div className="bg-[#112240] rounded-xl p-6 border border-white/10">
          <h3 className="font-bold text-white mb-3">Cómo usar tu API</h3>
          <div className="font-mono text-sm text-[#a8b4c8] space-y-1">
            <p><span className="text-[#c9a84c]">GET</span> https://genapi.cl/api/v1/ventas/<span className="text-white">YYYYMM</span></p>
            <p><span className="text-[#c9a84c]">GET</span> https://genapi.cl/api/v1/compras/<span className="text-white">YYYYMM</span></p>
            <p><span className="text-[#c9a84c]">GET</span> https://genapi.cl/api/v1/f29/<span className="text-white">YYYYMM</span></p>
            <p className="mt-2">Header: <span className="text-green-400">X-Api-Token: tu-token</span></p>
          </div>
        </div>
      </div>
    </main>
  );
}
