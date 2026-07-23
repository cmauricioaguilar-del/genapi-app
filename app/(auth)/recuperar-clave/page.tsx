"use client";
import { useState } from "react";
import Link from "next/link";

const LogoSVG = () => (
  <svg width="80" height="80" viewBox="290 52 100 120" role="img" aria-label="Logo GENAPI">
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
  </svg>
);

export default function RecuperarClave() {
  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError]     = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/recuperar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("Error del servidor");
      setEnviado(true);
    } catch {
      setError("Error al procesar la solicitud. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a1628] flex flex-col items-center justify-center px-4">

      <div className="text-center mb-8">
        <Link href="/" className="inline-block mb-2">
          <LogoSVG />
        </Link>
        <h1 className="text-2xl font-bold text-[#c9a84c] tracking-widest mt-1">GENAPI</h1>
        <p className="text-[#a8b4c8] text-sm mt-1">Recuperar contraseña</p>
      </div>

      <div className="w-full max-w-md bg-[#112240] rounded-xl p-8 border border-white/10 shadow-xl">
        {enviado ? (
          <div className="text-center space-y-4">
            <div className="text-4xl">📧</div>
            <p className="text-white font-semibold">Revisa tu correo</p>
            <p className="text-[#a8b4c8] text-sm">
              Si el email está registrado, recibirás un enlace para restablecer tu contraseña. El enlace expira en 1 hora.
            </p>
            <Link href="/login" className="block text-sm text-[#c9a84c] hover:underline mt-4">
              ← Volver al login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <p className="text-[#a8b4c8] text-sm">
              Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña.
            </p>
            <div>
              <label className="block text-xs text-[#a8b4c8] uppercase tracking-widest mb-1.5">
                Email de tu cuenta
              </label>
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-[#0a1628] border border-white/20 rounded-lg text-white placeholder-[#4a5a78] focus:outline-none focus:border-[#c9a84c] transition text-sm"
                placeholder="tu@email.com" autoComplete="email"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-[#c9a84c] text-[#0a1628] rounded-lg font-bold hover:bg-[#e4c97a] transition disabled:opacity-50 text-sm tracking-wide">
              {loading ? "Enviando..." : "Enviar enlace de recuperación →"}
            </button>
            <div className="text-center">
              <Link href="/login" className="text-sm text-[#a8b4c8] hover:text-[#c9a84c] transition">
                ← Volver al login
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
