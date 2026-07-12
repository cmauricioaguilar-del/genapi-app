import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import WebhookForm from "./WebhookForm";

export default async function WebhookPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const cliente = await prisma.cliente.findUnique({
    where: { id: session.id },
    include: { empresas: { select: { id: true, nombre: true, rut: true, webhookUrl: true, webhookSecret: true } } },
  });
  if (!cliente) redirect("/login");

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

      <div className="flex flex-1">
        {/* SIDEBAR */}
        <aside className="w-56 shrink-0 border-r border-white/10 py-6 px-4 space-y-1">
          <p className="text-xs uppercase tracking-widest text-[#a8b4c8] mb-3 px-2">Menú</p>
          {[
            { href: "/dashboard", label: "Dashboard", icon: "◈" },
            { href: "/dashboard/empresas/nueva", label: "Empresas", icon: "⊞" },
            { href: "/dashboard/webhook", label: "Webhook", icon: "⇆", active: true },
          ].map(item => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${item.active ? "bg-[#112240] text-white" : "text-[#cdd6e8] hover:bg-[#112240]"}`}>
              <span className="text-[#c9a84c]">{item.icon}</span> {item.label}
            </Link>
          ))}
        </aside>

        {/* MAIN */}
        <main className="flex-1 px-8 py-8 max-w-2xl">
          <p className="text-xs uppercase tracking-widest text-[#a8b4c8] mb-1">Cuenta</p>
          <h1 className="text-2xl font-bold text-white mb-1">Webhook</h1>
          <p className="text-sm text-[#a8b4c8] mb-8">
            Recibe notificaciones cada vez que termina una extracción.
          </p>

          {cliente.empresas.length === 0 ? (
            <div className="bg-[#112240] rounded-xl p-8 border border-white/10 text-center text-[#a8b4c8]">
              Primero{" "}
              <Link href="/dashboard/empresas/nueva" className="text-[#c9a84c] underline">conecta una empresa</Link>
              {" "}para configurar el webhook.
            </div>
          ) : (
            <WebhookForm empresas={cliente.empresas as any} />
          )}

          {/* EJEMPLO */}
          <div className="mt-10">
            <p className="text-xs uppercase tracking-widest text-[#a8b4c8] mb-3">Ejemplo</p>
            <h2 className="text-base font-bold text-white mb-2">Payload</h2>
            <p className="text-sm text-[#a8b4c8] mb-3">Esto es lo que recibirá tu endpoint en cada notificación:</p>

            <div className="bg-[#060f1e] rounded-xl border border-white/10 p-4 font-mono text-xs space-y-1 text-[#a8b4c8] mb-6">
              <p><span className="text-[#c9a84c]">POST</span> https://tudominio.com/api/webhook/genapi</p>
              <p>Content-Type: application/json</p>
              <p>X-Webhook-Secret: <span className="text-[#a8b4c8]">tu-secret</span></p>
              <p className="mt-3 text-[#cdd6e8]">{"{"}</p>
              <p className="pl-4"><span className="text-green-400">"event"</span>: <span className="text-orange-300">"extraction_complete"</span>,</p>
              <p className="pl-4"><span className="text-green-400">"module"</span>: <span className="text-orange-300">"ventas"</span>,</p>
              <p className="pl-4"><span className="text-green-400">"rut"</span>: <span className="text-orange-300">"76.543.210-K"</span>,</p>
              <p className="pl-4"><span className="text-green-400">"period"</span>: <span className="text-orange-300">"202606"</span>,</p>
              <p className="pl-4"><span className="text-green-400">"status"</span>: <span className="text-orange-300">"SUCCESS"</span>,</p>
              <p className="pl-4"><span className="text-green-400">"filas"</span>: <span className="text-blue-300">142</span>,</p>
              <p className="pl-4"><span className="text-green-400">"task_id"</span>: <span className="text-orange-300">"a1b2c3d4-e5f6-..."</span></p>
              <p className="text-[#cdd6e8]">{"}"}</p>
            </div>

            {/* TABLA DE CAMPOS */}
            <h2 className="text-base font-bold text-white mb-3">Campos del payload</h2>
            <div className="bg-[#112240] rounded-xl border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-[#a8b4c8] uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Campo</th>
                    <th className="text-left px-4 py-3">Tipo</th>
                    <th className="text-left px-4 py-3">Descripción</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {[
                    ["event", "string", "Siempre extraction_complete"],
                    ["module", "string", "Módulo extraído: ventas, compras, f29, honorarios, indicadores"],
                    ["rut", "string", "RUT de la empresa"],
                    ["period", "string", "Período (YYYYMM o YYYY)"],
                    ["status", "string", "SUCCESS o FAILED"],
                    ["filas", "int|null", "Registros extraídos (null si falló)"],
                    ["task_id", "string", "ID de la extracción para consultar detalles via API"],
                    ["error", "string|null", "Mensaje de error (solo si status es FAILED)"],
                  ].map(([campo, tipo, desc], i) => (
                    <tr key={campo} className={`border-b border-white/5 ${i % 2 === 0 ? "" : "bg-white/[0.02]"}`}>
                      <td className="px-4 py-2.5"><code className="text-[#c9a84c] bg-[#0a1628] px-1.5 py-0.5 rounded">{campo}</code></td>
                      <td className="px-4 py-2.5 text-[#a8b4c8]">{tipo}</td>
                      <td className="px-4 py-2.5 text-[#cdd6e8]">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-start gap-2 bg-[#112240]/60 border border-white/10 rounded-lg px-4 py-3 text-xs text-[#a8b4c8]">
              <span className="text-blue-400 mt-0.5">ℹ</span>
              <span>
                Tu endpoint debe responder con <code className="text-white">2xx</code> en menos de 10 segundos.
                Si falla, el webhook se reintentará hasta <strong className="text-white">3 veces</strong> con backoff exponencial.
              </span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
