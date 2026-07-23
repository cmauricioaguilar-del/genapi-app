"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

export default function Login() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [clave, setClave]       = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [captcha, setCaptcha]   = useState(false);
  const [checking, setChecking] = useState(false);

  function toggleCaptcha() {
    if (captcha || checking) return;
    setChecking(true);
    setTimeout(() => { setChecking(false); setCaptcha(true); }, 700);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!captcha) { setError("Por favor confirma que no eres un robot."); return; }
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, clave }),
    });
    const data = await res.json();
    if (data.ok) {
      router.push("/dashboard");
    } else {
      setError(data.error ?? "Error al iniciar sesión.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a1628] flex flex-col items-center justify-center px-4">

      {/* Logo + título */}
      <div className="text-center mb-8">
        <Link href="/" className="inline-block mb-2">
          <LogoSVG />
        </Link>
        <h1 className="text-2xl font-bold text-[#c9a84c] tracking-widest mt-1">GENAPI</h1>
        <p className="text-[#a8b4c8] text-sm mt-1">Inicia sesión en tu cuenta</p>
      </div>

      {/* Card */}
      <form onSubmit={handleSubmit}
        className="w-full max-w-md bg-[#112240] rounded-xl p-8 border border-white/10 space-y-5 shadow-xl">

        <div>
          <label className="block text-xs text-[#a8b4c8] uppercase tracking-widest mb-1.5">Email</label>
          <input
            type="email" required value={email} onChange={e => setEmail(e.target.value)}
            className="w-full px-4 py-3 bg-[#0a1628] border border-white/20 rounded-lg text-white placeholder-[#4a5a78] focus:outline-none focus:border-[#c9a84c] transition text-sm"
            placeholder="tu@email.com" autoComplete="email"
          />
        </div>

        <div>
          <label className="block text-xs text-[#a8b4c8] uppercase tracking-widest mb-1.5">Contraseña</label>
          <input
            type="password" required value={clave} onChange={e => setClave(e.target.value)}
            className="w-full px-4 py-3 bg-[#0a1628] border border-white/20 rounded-lg text-white placeholder-[#4a5a78] focus:outline-none focus:border-[#c9a84c] transition text-sm"
            placeholder="••••••••" autoComplete="current-password"
          />
        </div>

        {/* Captcha simulado */}
        <div
          onClick={toggleCaptcha}
          className="flex items-center justify-between px-4 py-3 rounded-lg cursor-pointer select-none"
          style={{ background: "#f9f9f9", border: "1px solid #d8d8d8", minHeight: 64 }}
        >
          <div className="flex items-center gap-3">
            <div style={{
              width: 24, height: 24, borderRadius: 3, flexShrink: 0,
              border: captcha ? "none" : "2px solid #c1c1c1",
              background: captcha ? "#4caf50" : checking ? "#f0f0f0" : "white",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.3s",
            }}>
              {checking && !captcha && (
                <div style={{ width: 14, height: 14, border: "2px solid #c9a84c", borderTop: "2px solid transparent", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
              )}
              {captcha && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7l4 4 6-7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span style={{ color: "#333", fontSize: 14 }}>No soy un robot</span>
          </div>
          <div className="text-right" style={{ opacity: 0.75 }}>
            <div style={{ fontSize: 20 }}>🛡️</div>
            <div style={{ fontSize: 9, color: "#555", lineHeight: 1.3 }}>reCAPTCHA</div>
            <div style={{ fontSize: 8, color: "#999" }}>Privacidad · Términos</div>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button type="submit" disabled={loading}
          className="w-full py-3 bg-[#c9a84c] text-[#0a1628] rounded-lg font-bold hover:bg-[#e4c97a] transition disabled:opacity-50 text-sm tracking-wide">
          {loading ? "Ingresando..." : "Ingresar →"}
        </button>

        <div className="text-center">
          <Link href="/recuperar-clave" className="text-sm text-[#a8b4c8] hover:text-[#c9a84c] transition">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <div className="border-t border-white/10 pt-4 text-center space-y-2">
          <p className="text-sm text-[#a8b4c8]">
            ¿No tienes cuenta?{" "}
            <Link href="/registro" className="text-[#c9a84c] hover:underline font-semibold">Crear cuenta gratis</Link>
          </p>
          <Link href="/" className="block text-xs text-[#4a5a78] hover:text-[#a8b4c8] transition">
            ← Volver al inicio
          </Link>
        </div>
      </form>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
