import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";

const MODULO_LABEL: Record<string, string> = {
  ventas: "Registro de Ventas",
  compras: "Registro de Compras",
  f29: "Formulario 29",
  honorarios: "Boletas de Honorarios",
  indicadores: "Indicadores",
  resumen: "Resumen",
};

const ESTADO_BADGE: Record<string, { label: string; cls: string }> = {
  SUCCESS:    { label: "Exitoso",     cls: "bg-green-500/20 text-green-400" },
  FAILED:     { label: "Fallido",     cls: "bg-red-500/20 text-red-400" },
  RUNNING:    { label: "En curso",    cls: "bg-yellow-500/20 text-yellow-400" },
  PENDING:    { label: "Pendiente",   cls: "bg-[#a8b4c8]/20 text-[#a8b4c8]" },
};

function duracion(creado: Date, actualizado: Date): string {
  const seg = Math.round((actualizado.getTime() - creado.getTime()) / 1000);
  if (seg < 2) return "—";
  return `${seg}s`;
}

function fmtFecha(d: Date): string {
  return d.toLocaleDateString("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default async function ExtraccionesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1"));
  const PER_PAGE = 50;

  const cliente = await prisma.cliente.findUnique({
    where: { id: session.id },
    include: { empresas: true },
  });
  if (!cliente) redirect("/login");

  const empresaIds = cliente.empresas.map((e: { id: string }) => e.id);

  const [extracciones, total] = await Promise.all([
    empresaIds.length > 0
      ? prisma.extraccion.findMany({
          where: { empresaId: { in: empresaIds } },
          include: { empresa: { select: { nombre: true, rut: true } } },
          orderBy: { creadoEn: "desc" },
          skip: (page - 1) * PER_PAGE,
          take: PER_PAGE,
        })
      : [],
    empresaIds.length > 0
      ? prisma.extraccion.count({ where: { empresaId: { in: empresaIds } } })
      : 0,
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);

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
            { href: "/dashboard/empresas", label: "Empresas", icon: "⊞" },
            { href: "/dashboard/extracciones", label: "Extracciones", icon: "↯", active: true },
            { href: "/dashboard/webhook", label: "Webhook", icon: "⇆" },
            { href: "/dashboard/docs", label: "API Docs", icon: "⟨/⟩" },
          ].map(item => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${(item as any).active ? "bg-[#112240] text-white" : "text-[#cdd6e8] hover:bg-[#112240]"}`}>
              <span className="text-[#c9a84c]">{item.icon}</span> {item.label}
            </Link>
          ))}
        </aside>

        {/* MAIN */}
        <main className="flex-1 overflow-y-auto px-8 py-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">Extracciones</h1>
            <p className="text-[#a8b4c8] mt-1 text-sm">Historial de consultas al SII — {total} registros totales</p>
          </div>

          {extracciones.length === 0 ? (
            <div className="bg-[#112240] rounded-xl p-16 border border-white/10 text-center">
              <p className="text-[#a8b4c8]">Aún no hay extracciones registradas.</p>
            </div>
          ) : (
            <>
              <div className="bg-[#112240] rounded-xl border border-white/10 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        {["Empresa", "Módulo", "Período", "Estado", "Registros", "Duración", "Fecha"].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-widest text-[#a8b4c8] font-medium whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {extracciones.map((ext: any) => {
                        const badge = ESTADO_BADGE[ext.estado] ?? { label: ext.estado, cls: "bg-white/10 text-white" };
                        return (
                          <tr key={ext.id} className="border-b border-white/5 hover:bg-white/5 transition">
                            <td className="px-4 py-3 text-[#c9a84c] text-xs font-mono whitespace-nowrap">
                              {ext.empresa.rut}
                            </td>
                            <td className="px-4 py-3 text-[#cdd6e8] whitespace-nowrap">
                              {MODULO_LABEL[ext.modulo] ?? ext.modulo}
                            </td>
                            <td className="px-4 py-3">
                              <span className="bg-[#0a1628] text-[#a8b4c8] px-2 py-0.5 rounded text-xs font-mono">
                                {ext.period}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
                                ● {badge.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[#a8b4c8] text-center">
                              {ext.filas != null ? ext.filas : "—"}
                            </td>
                            <td className="px-4 py-3 text-[#a8b4c8] text-xs font-mono">
                              {duracion(ext.creadoEn, ext.actualizadoEn)}
                            </td>
                            <td className="px-4 py-3 text-[#a8b4c8] text-xs whitespace-nowrap">
                              {fmtFecha(ext.creadoEn)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* PAGINACIÓN */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-[#a8b4c8]">
                    Página {page} de {totalPages} — {total} extracciones
                  </p>
                  <div className="flex gap-2">
                    {page > 1 && (
                      <Link href={`/dashboard/extracciones?page=${page - 1}`}
                        className="px-3 py-1.5 text-xs bg-[#112240] text-[#cdd6e8] rounded hover:bg-white/10 transition">
                        ← Anterior
                      </Link>
                    )}
                    {page < totalPages && (
                      <Link href={`/dashboard/extracciones?page=${page + 1}`}
                        className="px-3 py-1.5 text-xs bg-[#112240] text-[#cdd6e8] rounded hover:bg-white/10 transition">
                        Siguiente →
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
