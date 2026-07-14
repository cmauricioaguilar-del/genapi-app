"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const PLANES = [
  {
    id: "STARTER",
    nombre: "Starter",
    precio: 24900,
    empresas: 1,
    consultas: "3/día",
    features: ["1 empresa", "3 consultas diarias", "Ventas, Compras, Honorarios, F29", "Soporte por email"],
  },
  {
    id: "PROFESIONAL",
    nombre: "Profesional",
    precio: 44900,
    empresas: 5,
    consultas: "20/día",
    features: ["5 empresas", "20 consultas diarias", "Todos los módulos", "Webhooks", "Soporte prioritario"],
    destacado: true,
  },
  {
    id: "BUSINESS",
    nombre: "Business",
    precio: 59900,
    empresas: 10,
    consultas: "100/día",
    features: ["10 empresas", "100 consultas diarias", "Todos los módulos", "Webhooks", "SLA 99.9%", "Soporte dedicado"],
  },
];

function fmtCLP(n: number) {
  return n.toLocaleString("es-CL", { style: "currency", currency: "CLP" });
}

export default function BillingPage() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status");

  const [cliente, setCliente] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [planActivo, setPlanActivo] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => { setCliente(d); setPlanActivo(d.plan); });
  }, []);

  async function suscribir(plan: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/flow/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error ?? "Error al iniciar pago");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a1628] text-[#cdd6e8] flex flex-col">
      {/* HEADER */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-white/10 shrink-0">
        <span className="text-xl font-bold text-[#c9a84c]">GENAPI</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[#a8b4c8]">{cliente?.email}</span>
          <span className="text-xs bg-[#c9a84c]/20 text-[#c9a84c] px-2 py-0.5 rounded font-medium">{cliente?.plan}</span>
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
            { href: "/dashboard/extracciones", label: "Extracciones", icon: "↯" },
            { href: "/dashboard/webhook", label: "Webhook", icon: "⇆" },
            { href: "/dashboard/docs", label: "API Docs", icon: "⟨/⟩" },
            { href: "/dashboard/billing", label: "Mi Plan", icon: "◎", active: true },
          ].map(item => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${(item as any).active ? "bg-[#112240] text-white" : "text-[#cdd6e8] hover:bg-[#112240]"}`}>
              <span className="text-[#c9a84c]">{item.icon}</span> {item.label}
            </Link>
          ))}
        </aside>

        {/* MAIN */}
        <main className="flex-1 overflow-y-auto px-8 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white">Mi Plan</h1>
            <p className="text-[#a8b4c8] mt-1 text-sm">Gestiona tu suscripción a GENAPI. Todos los precios incluyen IVA.</p>
          </div>

          {/* Banner de retorno de Flow */}
          {status === "pending" && (
            <div className="mb-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-5 py-4 text-sm text-yellow-300">
              Tu pago está siendo procesado. El plan se activará automáticamente en los próximos minutos.
            </div>
          )}

          {/* Plan actual */}
          {cliente && (
            <div className="mb-8 bg-[#112240] rounded-xl border border-white/10 p-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-[#a8b4c8] mb-1">Plan actual</p>
                <p className="text-xl font-bold text-white">{cliente.plan}</p>
                {cliente.planVencimiento && (
                  <p className="text-xs text-[#a8b4c8] mt-1">
                    Próximo cobro: {new Date(cliente.planVencimiento).toLocaleDateString("es-CL")}
                  </p>
                )}
                {cliente.plan === "TRIAL" && (
                  <p className="text-xs text-[#c9a84c] mt-1">30 días gratuitos — suscríbete para continuar</p>
                )}
              </div>
              <span className="text-3xl font-bold text-[#c9a84c]">
                {cliente.plan === "TRIAL" ? "Gratis" : fmtCLP(PLANES.find(p => p.id === cliente.plan)?.precio ?? 0)}
                {cliente.plan !== "TRIAL" && <span className="text-sm font-normal text-[#a8b4c8]">/mes</span>}
              </span>
            </div>
          )}

          {/* Cards de planes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANES.map(plan => {
              const esCurrent = planActivo === plan.id;
              return (
                <div key={plan.id}
                  className={`relative rounded-xl border p-6 flex flex-col ${plan.destacado ? "border-[#c9a84c] bg-[#112240]" : "border-white/10 bg-[#112240]"}`}>
                  {plan.destacado && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs bg-[#c9a84c] text-[#0a1628] px-3 py-0.5 rounded-full font-bold">
                      Más popular
                    </span>
                  )}
                  <h3 className="text-lg font-bold text-white mb-1">{plan.nombre}</h3>
                  <p className="text-3xl font-bold text-[#c9a84c] mb-1">
                    {fmtCLP(plan.precio)}
                    <span className="text-sm font-normal text-[#a8b4c8]">/mes</span>
                  </p>
                  <p className="text-xs text-[#a8b4c8] mb-4">Precio con IVA incluido</p>

                  <ul className="space-y-2 flex-1 mb-6">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-2 text-sm text-[#cdd6e8]">
                        <span className="text-green-400 mt-0.5">✓</span> {f}
                      </li>
                    ))}
                  </ul>

                  {esCurrent ? (
                    <div className="w-full text-center text-xs text-[#a8b4c8] py-2 border border-white/10 rounded-lg">
                      Plan actual
                    </div>
                  ) : (
                    <button
                      onClick={() => suscribir(plan.id)}
                      disabled={loading}
                      className={`w-full py-2.5 rounded-lg text-sm font-bold transition ${plan.destacado
                        ? "bg-[#c9a84c] text-[#0a1628] hover:bg-[#e4c97a]"
                        : "bg-white/10 text-white hover:bg-white/20"} disabled:opacity-50`}>
                      {loading ? "Redirigiendo…" : planActivo === "TRIAL" ? "Suscribirse" : "Cambiar plan"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Enterprise */}
          <div className="mt-6 bg-[#112240] rounded-xl border border-white/10 p-6 flex items-center justify-between">
            <div>
              <p className="font-bold text-white">Enterprise</p>
              <p className="text-sm text-[#a8b4c8] mt-1">Empresas ilimitadas, consultas ilimitadas, SLA personalizado, integración dedicada.</p>
            </div>
            <a href="mailto:contacto@genapi.cl"
              className="shrink-0 ml-6 px-5 py-2 text-sm border border-[#c9a84c] text-[#c9a84c] rounded-lg hover:bg-[#c9a84c]/10 transition">
              Contactar
            </a>
          </div>
        </main>
      </div>
    </div>
  );
}
