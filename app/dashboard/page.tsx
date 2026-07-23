import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import ExtraccionesAcordeon from "./ExtraccionesAcordeon";

const LIMITES: Record<string, number> = { STARTER: 3, PROFESIONAL: 10, BUSINESS: 20, ENTERPRISE: 999999 };
const MODULOS = ["ventas", "compras", "f29", "honorarios", "indicadores", "resumen"];
const MODULO_LABEL: Record<string, string> = {
  ventas: "Ventas", compras: "Compras", f29: "Form. 29",
  honorarios: "Honorarios", indicadores: "Indicadores", resumen: "Resumen",
};

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

  const empresaIds = cliente.empresas.map((e: { id: string }) => e.id);

  const totalExtracciones = empresaIds.length > 0
    ? await prisma.extraccion.count({ where: { empresaId: { in: empresaIds } } })
    : 0;

  const exitosas = empresaIds.length > 0
    ? await prisma.extraccion.count({ where: { empresaId: { in: empresaIds }, estado: "SUCCESS" } })
    : 0;

  // Última extracción por empresa+modulo
  const todasExtracciones = empresaIds.length > 0
    ? await prisma.extraccion.findMany({
        where: { empresaId: { in: empresaIds } },
        orderBy: { creadoEn: "desc" },
        select: { id: true, empresaId: true, modulo: true, period: true, estado: true, filas: true, errorMsg: true, creadoEn: true },
      })
    : [];

  // Agrupar: última por empresa+modulo
  const ultimaPorEmpresaModulo = new Map<string, typeof todasExtracciones[0]>();
  for (const ext of todasExtracciones) {
    const key = `${ext.empresaId}::${ext.modulo}`;
    if (!ultimaPorEmpresaModulo.has(key)) ultimaPorEmpresaModulo.set(key, ext);
  }

  const empresasAcordeon = cliente.empresas.map((emp: { id: string; nombre: string }) => {
    const ultimas = Array.from(ultimaPorEmpresaModulo.values())
      .filter(e => e.empresaId === emp.id)
      .map(e => ({ ...e, creadoEn: e.creadoEn.toISOString() }));

    const modulosFallidos = ultimas.filter(e => e.estado === "FAILED").map(e => e.modulo);

    return {
      id: emp.id,
      nombre: emp.nombre,
      ultimasExtracciones: ultimas,
      tieneError: modulosFallidos.length > 0,
      modulosFallidos,
    };
  });

  return (
    <div className="min-h-screen bg-[#0a1628] text-[#cdd6e8] flex flex-col">
      {/* HEADER */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-white/10 shrink-0">
        <span className="text-xl font-bold text-[#c9a84c]">GENAPI</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[#a8b4c8]">{cliente.email}</span>
          <span className="text-xs bg-[#c9a84c]/20 text-[#c9a84c] px-2 py-0.5 rounded font-medium">{cliente.plan}</span>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="text-sm text-[#a8b4c8] hover:text-white transition">Salir</button>
          </form>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <aside className="w-56 shrink-0 border-r border-white/10 py-6 px-4 space-y-1">
          <p className="text-xs uppercase tracking-widest text-[#a8b4c8] mb-3 px-2">Menú</p>
          {[
            { href: "/dashboard",              label: "Dashboard",    icon: "◈" },
            { href: "/dashboard/empresas",     label: "Empresas",     icon: "⊞" },
            { href: "/dashboard/extracciones", label: "Extracciones", icon: "↯" },
            { href: "/dashboard/webhook",      label: "Webhook",      icon: "⇆" },
            { href: "/dashboard/docs",         label: "API Docs",     icon: "⟨/⟩" },
            { href: "/dashboard/billing",      label: "Mi Plan",      icon: "◎" },
          ].map(item => (
            <Link key={item.href} href={item.href}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#cdd6e8] hover:bg-[#112240] transition">
              <span className="text-[#c9a84c]">{item.icon}</span> {item.label}
            </Link>
          ))}
          <div className="pt-4">
            <p className="text-xs uppercase tracking-widest text-[#a8b4c8] mb-3 px-2">Módulos API</p>
            {MODULOS.map(m => (
              <div key={m} className="flex items-center gap-2 px-3 py-1.5 text-xs text-[#a8b4c8]">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0"></span>
                {MODULO_LABEL[m] ?? m}
              </div>
            ))}
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1 overflow-y-auto px-8 py-8 space-y-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Hola, {cliente.nombre.split(" ")[0]}</h1>
            <p className="text-[#a8b4c8] mt-1 text-sm">Resumen de actividad de tu cuenta</p>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Empresas activas",  valor: cliente.empresas.length },
              { label: "Módulos disponibles", valor: MODULOS.length },
              { label: "Extracciones hoy", valor: consultasHoy, sub: `límite ${limite === 999999 ? "∞" : limite}` },
              { label: "Tasa de éxito", valor: totalExtracciones > 0 ? `${Math.round(exitosas / totalExtracciones * 100)}%` : "—" },
            ].map(k => (
              <div key={k.label} className="bg-[#112240] rounded-xl p-5 border border-white/10">
                <p className="text-xs text-[#a8b4c8] mb-1">{k.label}</p>
                <p className="text-3xl font-bold text-white">{k.valor}</p>
                {k.sub && <p className="text-xs text-[#a8b4c8] mt-1">{k.sub}</p>}
              </div>
            ))}
          </div>

          {/* ACORDEÓN DE EXTRACCIONES */}
          <div>
            <h2 className="text-lg font-bold text-white mb-4">Actividad Reciente — Extracciones</h2>
            <ExtraccionesAcordeon empresas={empresasAcordeon} />
          </div>
        </main>
      </div>
    </div>
  );
}
