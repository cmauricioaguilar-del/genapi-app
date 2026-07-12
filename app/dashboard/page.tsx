import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";

const LIMITES: Record<string, number> = { STARTER: 3, PROFESIONAL: 10, BUSINESS: 20, ENTERPRISE: 999999 };
const MODULOS = ["ventas", "compras", "f29", "honorarios", "indicadores", "resumen"];

const MODULO_LABEL: Record<string, string> = {
  ventas: "Ventas",
  compras: "Compras",
  f29: "Form. 29",
  honorarios: "Honorarios",
  indicadores: "Indicadores",
  resumen: "Resumen",
};

const ESTADO_BADGE: Record<string, { label: string; dot: string; text: string }> = {
  SUCCESS: { label: "Exitoso", dot: "bg-green-400", text: "text-green-400" },
  FAILED: { label: "Fallido", dot: "bg-red-400", text: "text-red-400" },
  RUNNING: { label: "En curso", dot: "bg-yellow-400", text: "text-yellow-400" },
  PENDING: { label: "Pendiente", dot: "bg-gray-400", text: "text-gray-400" },
};

function fmtFecha(d: Date) {
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtPeriod(p: string) {
  if (p.length === 6) return `${p.slice(4, 6)}/${p.slice(0, 4)}`;
  return p;
}

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

  const extracciones = empresaIds.length > 0
    ? await prisma.extraccion.findMany({
        where: { empresaId: { in: empresaIds } },
        include: { empresa: { select: { nombre: true } } },
        orderBy: { creadoEn: "desc" },
        take: 20,
      })
    : [];

  const totalExtracciones = empresaIds.length > 0
    ? await prisma.extraccion.count({ where: { empresaId: { in: empresaIds } } })
    : 0;

  const exitosas = empresaIds.length > 0
    ? await prisma.extraccion.count({ where: { empresaId: { in: empresaIds }, estado: "SUCCESS" } })
    : 0;

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
            { href: "/dashboard", label: "Dashboard", icon: "◈" },
            { href: "/dashboard/empresas/nueva", label: "Empresas", icon: "⊞" },
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
          {/* BIENVENIDA */}
          <div>
            <h1 className="text-2xl font-bold text-white">Hola, {cliente.nombre.split(" ")[0]}</h1>
            <p className="text-[#a8b4c8] mt-1 text-sm">Resumen de actividad de tu cuenta</p>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Empresas activas", valor: cliente.empresas.length },
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

          {/* EXTRACCIONES RECIENTES */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Actividad Reciente — Extracciones</h2>
              <span className="text-xs text-[#a8b4c8]">Últimas {extracciones.length} de {totalExtracciones}</span>
            </div>

            {extracciones.length === 0 ? (
              <div className="bg-[#112240] rounded-xl p-10 border border-white/10 text-center text-[#a8b4c8]">
                Aún no hay extracciones registradas. Usa la API para comenzar.
              </div>
            ) : (
              <div className="bg-[#112240] rounded-xl border border-white/10 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs text-[#a8b4c8] uppercase tracking-wider">
                      <th className="text-left px-4 py-3">Empresa</th>
                      <th className="text-left px-4 py-3">Módulo</th>
                      <th className="text-left px-4 py-3">Período</th>
                      <th className="text-left px-4 py-3">Estado</th>
                      <th className="text-right px-4 py-3">Registros</th>
                      <th className="text-right px-4 py-3">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extracciones.map((ext: any, i: number) => {
                      const badge = ESTADO_BADGE[ext.estado] ?? ESTADO_BADGE.PENDING;
                      return (
                        <tr key={ext.id} className={`border-b border-white/5 hover:bg-white/5 transition ${i % 2 === 0 ? "" : "bg-white/[0.02]"}`}>
                          <td className="px-4 py-3 font-medium text-white">{ext.empresa.nombre}</td>
                          <td className="px-4 py-3 text-[#a8b4c8]">{MODULO_LABEL[ext.modulo] ?? ext.modulo}</td>
                          <td className="px-4 py-3 text-[#a8b4c8]">{fmtPeriod(ext.period)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 text-xs ${badge.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}></span>
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-[#a8b4c8]">{ext.filas ?? "—"}</td>
                          <td className="px-4 py-3 text-right text-[#a8b4c8] text-xs">{fmtFecha(ext.creadoEn)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* EMPRESAS + TOKENS */}
          {cliente.empresas.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">Mis empresas</h2>
                <Link href="/dashboard/empresas/nueva" className="px-4 py-2 text-xs bg-[#c9a84c] text-[#0a1628] rounded font-bold hover:bg-[#e4c97a] transition">
                  + Agregar
                </Link>
              </div>
              <div className="space-y-3">
                {cliente.empresas.map((emp: { id: string; nombre: string; rut: string; apiToken: string }) => (
                  <div key={emp.id} className="bg-[#112240] rounded-xl p-5 border border-white/10 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-white">{emp.nombre}</p>
                      <p className="text-sm text-[#a8b4c8]">RUT: {emp.rut}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-[#a8b4c8] mb-1">Token de API</p>
                      <code className="text-xs bg-[#0a1628] text-[#c9a84c] px-3 py-1 rounded border border-white/10">
                        {emp.apiToken}
                      </code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
