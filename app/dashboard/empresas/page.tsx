import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import EliminarEmpresa from "./EliminarEmpresa";

export default async function EmpresasPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const empresas = await prisma.empresa.findMany({
    where: { clienteId: session.id },
    orderBy: { creadoEn: "asc" },
    select: { id: true, nombre: true, rut: true, apiToken: true, activa: true, creadoEn: true },
  });

  return (
    <div className="min-h-screen bg-[#0a1628] text-[#cdd6e8]">
      {/* HEADER */}
      <div className="border-b border-white/10 px-8 py-5 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2 text-sm text-[#a8b4c8] hover:text-white transition">
          <span>←</span> Volver al dashboard
        </Link>
        <span className="text-lg font-bold text-[#c9a84c]">GENAPI</span>
      </div>

      <div className="max-w-3xl mx-auto px-8 py-10">
        {/* TÍTULO */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Mis Empresas</h1>
            <p className="text-sm text-[#a8b4c8] mt-1">
              {empresas.length} empresa{empresas.length !== 1 ? "s" : ""} registrada{empresas.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Link href="/dashboard/empresas/nueva"
            className="bg-[#c9a84c] text-[#0a1628] px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#e4c97a] transition">
            + Nueva empresa
          </Link>
        </div>

        {/* LISTA */}
        {empresas.length === 0 ? (
          <div className="bg-[#112240] rounded-xl border border-white/10 p-12 text-center">
            <p className="text-[#a8b4c8] mb-3">No tienes empresas registradas.</p>
            <Link href="/dashboard/empresas/nueva" className="text-[#c9a84c] text-sm hover:underline">
              Agregar primera empresa →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {empresas.map((e) => (
              <div key={e.id} className="bg-[#112240] rounded-xl border border-white/10 p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* Nombre + badge */}
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-white font-semibold text-base">{e.nombre}</span>
                      <span className={`text-xs px-2 py-0.5 rounded border font-medium ${
                        e.activa
                          ? "bg-green-400/10 text-green-400 border-green-400/30"
                          : "bg-red-400/10 text-red-400 border-red-400/30"
                      }`}>
                        {e.activa ? "Activa" : "Inactiva"}
                      </span>
                    </div>

                    <p className="text-xs text-[#a8b4c8] mb-4">RUT: {e.rut}</p>

                    {/* Token */}
                    <div className="bg-[#0a1628] border border-white/10 rounded-lg px-4 py-3 inline-block">
                      <p className="text-xs text-[#a8b4c8] mb-1">API Token</p>
                      <code className="text-xs text-[#c9a84c] break-all">{e.apiToken}</code>
                    </div>
                  </div>

                  <div className="ml-4 mt-1">
                    <EliminarEmpresa empresaId={e.id} nombre={e.nombre} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
