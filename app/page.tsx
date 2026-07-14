import Link from "next/link";

const LogoSVG = () => (
  <svg width="100%" viewBox="0 0 680 320" role="img" aria-label="Logo GENAPI">
    <title>GENAPI</title>
    <polygon points="340,52 390,80 390,136 340,164 290,136 290,80" fill="none" stroke="#c9a84c" strokeWidth="2.5"/>
    <polygon points="340,72 373,91 373,129 340,148 307,129 307,91" fill="#0a1628" stroke="#c9a84c" strokeWidth="1.2"/>
    <circle cx="340" cy="72" r="4" fill="#c9a84c"/>
    <circle cx="373" cy="91" r="4" fill="#c9a84c"/>
    <circle cx="373" cy="129" r="4" fill="#c9a84c"/>
    <circle cx="340" cy="148" r="4" fill="#c9a84c"/>
    <circle cx="307" cy="129" r="4" fill="#c9a84c"/>
    <circle cx="307" cy="91" r="4" fill="#c9a84c"/>
    <circle cx="340" cy="110" r="8" fill="#c9a84c"/>
    <circle cx="340" cy="110" r="4" fill="#0a1628"/>
    <line x1="340" y1="110" x2="340" y2="72" stroke="#c9a84c" strokeWidth="1" opacity="0.6"/>
    <line x1="340" y1="110" x2="373" y2="91" stroke="#c9a84c" strokeWidth="1" opacity="0.6"/>
    <line x1="340" y1="110" x2="373" y2="129" stroke="#c9a84c" strokeWidth="1" opacity="0.6"/>
    <line x1="340" y1="110" x2="340" y2="148" stroke="#c9a84c" strokeWidth="1" opacity="0.6"/>
    <line x1="340" y1="110" x2="307" y2="129" stroke="#c9a84c" strokeWidth="1" opacity="0.6"/>
    <line x1="340" y1="110" x2="307" y2="91" stroke="#c9a84c" strokeWidth="1" opacity="0.6"/>
    <line x1="240" y1="110" x2="286" y2="110" stroke="#c9a84c" strokeWidth="1" opacity="0.35"/>
    <line x1="394" y1="110" x2="440" y2="110" stroke="#c9a84c" strokeWidth="1" opacity="0.35"/>
    <circle cx="236" cy="110" r="3" fill="#c9a84c" opacity="0.5"/>
    <circle cx="444" cy="110" r="3" fill="#c9a84c" opacity="0.5"/>
    <text x="340" y="212" textAnchor="middle" fontFamily="'Barlow', 'Arial', sans-serif" fontWeight="700" fontSize="52" letterSpacing="10" fill="#c9a84c">GENAPI</text>
    <line x1="200" y1="228" x2="480" y2="228" stroke="#c9a84c" strokeWidth="0.8" opacity="0.4"/>
    <text x="340" y="252" textAnchor="middle" fontFamily="'Barlow', 'Arial', sans-serif" fontWeight="400" fontSize="12" letterSpacing="2.5" fill="#8a9ab8">{"API's para Integración de Sistemas"}</text>
  </svg>
);

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

      {/* HERO — logo izquierda, texto derecha */}
      <section className="max-w-6xl mx-auto px-8 pt-16 pb-16">
        <div className="flex flex-col lg:flex-row items-center gap-12">
          {/* LOGO GRANDE */}
          <div className="w-full lg:w-[420px] shrink-0">
            <LogoSVG />
          </div>

          {/* TEXTO */}
          <div className="flex-1">
            <div className="inline-block px-3 py-1 mb-6 text-xs font-semibold bg-[#c9a84c]/20 text-[#c9a84c] rounded-full border border-[#c9a84c]/30">
              API SII Chile · RCV · F29 · Honorarios
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight">
              Conecta tu software al SII<br />
              <span className="text-[#c9a84c]">en minutos, no en semanas</span>
            </h1>
            <p className="text-lg text-[#a8b4c8] mb-10">
              API REST para extraer ventas, compras y F29 directamente del SII chileno.
              Sin complicaciones, sin burocracia. Más barato que la competencia.
            </p>
            <div className="flex gap-4 flex-wrap">
              <Link href="/registro" className="px-8 py-4 bg-[#c9a84c] text-[#0a1628] rounded-lg font-bold text-lg hover:bg-[#e4c97a] transition">
                Crear cuenta gratis
              </Link>
              <a href="#pricing" className="px-8 py-4 border border-white/20 text-white rounded-lg font-semibold text-lg hover:bg-white/5 transition">
                Ver precios
              </a>
            </div>
          </div>
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
      <section id="pricing" className="max-w-5xl mx-auto px-8 pb-16">
        <h2 className="text-3xl font-bold text-white text-center mb-4">Planes disponibles</h2>
        <p className="text-center text-[#a8b4c8] mb-10 text-sm">Comienza gratis 30 días, sin tarjeta de crédito. Todos los precios incluyen IVA.</p>

        {/* TRIAL */}
        <div className="mb-6 bg-[#112240] border border-[#c9a84c]/40 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold bg-[#c9a84c]/20 text-[#c9a84c] px-2 py-0.5 rounded uppercase tracking-wider">Prueba gratuita</span>
            <h3 className="text-xl font-bold text-white mt-2">30 días gratis</h3>
            <p className="text-sm text-[#a8b4c8] mt-1">1 empresa · 3 consultas/día · Ventas, Compras, Honorarios, F29 · Sin tarjeta de crédito</p>
          </div>
          <Link href="/registro" className="shrink-0 px-6 py-2.5 bg-[#c9a84c] text-[#0a1628] font-bold rounded-lg hover:bg-[#e4c97a] transition text-sm">
            Crear cuenta gratis →
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { nombre: "Starter", precio: "$24.900", empresas: "1", consultas: "3", modulos: ["Ventas", "Compras", "Honorarios", "F29"], destacado: false },
            { nombre: "Profesional", precio: "$44.900", empresas: "5", consultas: "20", modulos: ["Ventas", "Compras", "Honorarios", "F29", "Webhooks"], destacado: true },
            { nombre: "Business", precio: "$59.900", empresas: "10", consultas: "100", modulos: ["Ventas", "Compras", "Honorarios", "F29", "Webhooks", "SLA 99.9%"], destacado: false },
          ].map((plan) => (
            <div key={plan.nombre} className={`rounded-xl p-6 border ${plan.destacado ? "bg-[#1e4d8c] border-[#c9a84c]" : "bg-[#112240] border-white/10"}`}>
              {plan.destacado && <div className="text-xs font-bold text-[#c9a84c] mb-3 uppercase tracking-wider">Más popular</div>}
              <h3 className="text-xl font-bold text-white mb-1">{plan.nombre}</h3>
              <p className="text-3xl font-bold text-[#c9a84c] mb-1">{plan.precio} <span className="text-sm font-normal text-[#a8b4c8]">/ mes c/IVA</span></p>
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

      {/* PARTNER BANNER */}
      <section className="max-w-5xl mx-auto px-8 pb-20">
        <div className="bg-[#112240] border border-[#c9a84c]/30 rounded-xl px-8 py-7 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <p className="text-xs font-semibold text-[#c9a84c] uppercase tracking-widest mb-1">Partner oficial</p>
            <h3 className="text-xl font-bold text-white mb-1">¿Necesitas integración a medida?</h3>
            <p className="text-[#a8b4c8] text-sm">
              Nexxus Consulting implementa GENAPI en tu plataforma. Somos especialistas en integración de sistemas empresariales en Chile.
            </p>
          </div>
          <a
            href="https://www.nexxus-consulting.com"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 px-7 py-3 bg-[#c9a84c] text-[#0a1628] rounded-lg font-bold text-sm hover:bg-[#e4c97a] transition whitespace-nowrap"
          >
            Visitar Nexxus Consulting →
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 px-8 py-6 text-center text-sm text-[#a8b4c8]">
        © 2026 GENAPI ·{" "}
        <a href="https://www.nexxus-consulting.com" target="_blank" rel="noopener noreferrer" className="text-[#c9a84c] hover:text-[#e4c97a] transition">
          Nexxus Consulting
        </a>
        {" "}· <a href="mailto:contacto@genapi.cl" className="hover:text-white">contacto@genapi.cl</a>
      </footer>
    </main>
  );
}
