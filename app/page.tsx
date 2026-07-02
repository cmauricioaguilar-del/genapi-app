import Link from "next/link";

export default function Landing() {
  return (
    <main className="min-h-screen bg-[#0a1628] text-[#cdd6e8] font-sans">
      {/* NAV */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/10">
        <span className="text-2xl font-bold text-[#c9a84c] tracking-tight">GENAPI</span>
        <div className="flex gap-4">
          <Link href="/login" className="px-4 py-2 text-sm text-[#cdd6e8] hover:text-white transition">Iniciar sesión</Link>
          <Link href="/registro" className="px-4 py-2 text-sm bg-[#c9a84c] text-[#0a1628] rounded font-semibold hover:bg-[#e4c97a] transition">Comenzar gratis</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="max-w-4xl mx-auto px-8 pt-24 pb-16 text-center">
        <div className="inline-block px-3 py-1 mb-6 text-xs font-semibold bg-[#c9a84c]/20 text-[#c9a84c] rounded-full border border-[#c9a84c]/30">
          API SII Chile · RCV · F29 · Honorarios
        </div>
        <h1 className="text-5xl font-bold text-white mb-6 leading-tight">
          Conecta tu software al SII<br />
          <span className="text-[#c9a84c]">en minutos, no en semanas</span>
        </h1>
        <p className="text-xl text-[#a8b4c8] mb-10 max-w-2xl mx-auto">
          API REST para extraer ventas, compras y F29 directamente del SII chileno.
          Sin complicaciones, sin burocracia. Más barato que la competencia.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/registro" className="px-8 py-4 bg-[#c9a84c] text-[#0a1628] rounded-lg font-bold text-lg hover:bg-[#e4c97a] transition">
            Crear cuenta gratis
          </Link>
          <a href="#pricing" className="px-8 py-4 border border-white/20 text-white rounded-lg font-semibold text-lg hover:bg-white/5 transition">
            Ver precios
          </a>
        </div>
      </section>

      {/* CODE EXAMPLE */}
      <section className="max-w-4xl mx-auto px-8 pb-16">
        <div className="bg-[#112240] rounded-xl p-6 font-mono text-sm border border-white/10">
          <p className="text-[#a8b4c8] mb-3">// Así de simple</p>
          <p><span className="text-[#c9a84c]">GET</span> <span className="text-white">https://genapi.cl/api/v1/ventas/202606</span></p>
          <p className="text-[#a8b4c8] mt-1">X-Api-Token: <span className="text-green-400">tu-token-aqui</span></p>
          <div className="mt-4 text-[#a8b4c8]">
            <p>{"{"}</p>
            <p className="pl-4">&quot;ok&quot;: <span className="text-green-400">true</span>,</p>
            <p className="pl-4">&quot;empresa&quot;: <span className="text-yellow-300">&quot;Mi Empresa SpA&quot;</span>,</p>
            <p className="pl-4">&quot;total&quot;: <span className="text-blue-300">233</span>,</p>
            <p className="pl-4">&quot;data&quot;: [...]</p>
            <p>{"}"}</p>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="max-w-5xl mx-auto px-8 pb-24">
        <h2 className="text-3xl font-bold text-white text-center mb-12">Planes disponibles</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { nombre: "Starter", precio: "0,70", empresas: "1", consultas: "3", modulos: ["Ventas", "Compras"], destacado: false },
            { nombre: "Profesional", precio: "1,20", empresas: "5", consultas: "10", modulos: ["Ventas", "Compras", "F29", "Previred"], destacado: true },
            { nombre: "Business", precio: "1,60", empresas: "10", consultas: "20", modulos: ["Ventas", "Compras", "F29", "Honorarios", "Arriendo", "Previred"], destacado: false },
          ].map((plan) => (
            <div key={plan.nombre} className={`rounded-xl p-6 border ${plan.destacado ? "bg-[#1e4d8c] border-[#c9a84c]" : "bg-[#112240] border-white/10"}`}>
              {plan.destacado && <div className="text-xs font-bold text-[#c9a84c] mb-3 uppercase tracking-wider">Más popular</div>}
              <h3 className="text-xl font-bold text-white mb-1">{plan.nombre}</h3>
              <p className="text-3xl font-bold text-[#c9a84c] mb-1">{plan.precio} <span className="text-sm font-normal text-[#a8b4c8]">UF/mes+IVA</span></p>
              <p className="text-sm text-[#a8b4c8] mb-4">{plan.empresas} empresa{plan.empresas !== "1" ? "s" : ""} · {plan.consultas} consultas/día</p>
              <ul className="space-y-2 mb-6">
                {plan.modulos.map(m => (
                  <li key={m} className="flex items-center gap-2 text-sm text-[#cdd6e8]">
                    <span className="text-green-400">✓</span> {m}
                  </li>
                ))}
              </ul>
              <Link href="/registro" className={`block text-center py-2 rounded-lg font-semibold text-sm transition ${plan.destacado ? "bg-[#c9a84c] text-[#0a1628] hover:bg-[#e4c97a]" : "border border-white/20 text-white hover:bg-white/5"}`}>
                Comenzar
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 px-8 py-6 text-center text-sm text-[#a8b4c8]">
        © 2026 GENAPI · Nexxus Consulting · <a href="mailto:contacto@genapi.cl" className="hover:text-white">contacto@genapi.cl</a>
      </footer>
    </main>
  );
}
