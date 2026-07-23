"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
    setTimeout(() => {
      setChecking(false);
      setCaptcha(true);
    }, 700);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!captcha) {
      setError("Por favor confirma que no eres un robot.");
      return;
    }
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
    <main className="min-h-screen bg-[#0a1628] flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-[#c9a84c]">GENAPI</Link>
          <p className="text-[#a8b4c8] mt-2">Inicia sesión en tu cuenta</p>
        </div>

        {/* Card */}
        <form onSubmit={handleSubmit} className="bg-[#112240] rounded-xl p-8 border border-white/10 space-y-4">
          <div>
            <label className="block text-sm text-[#a8b4c8] mb-1">Email</label>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-[#0a1628] border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#c9a84c] transition"
              placeholder="tu@email.com" autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm text-[#a8b4c8] mb-1">Contraseña</label>
            <input
              type="password" required value={clave} onChange={e => setClave(e.target.value)}
              className="w-full px-4 py-3 bg-[#0a1628] border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#c9a84c] transition"
              placeholder="••••••••" autoComplete="current-password"
            />
          </div>

          {/* Captcha simulado */}
          <div
            onClick={toggleCaptcha}
            className="flex items-center justify-between px-4 py-3 rounded-lg cursor-pointer select-none border border-gray-200"
            style={{ background: "#f9f9f9", minHeight: 64 }}
          >
            <div className="flex items-center gap-3">
              <div style={{
                width: 24, height: 24,
                border: captcha ? "none" : "2px solid #c1c1c1",
                borderRadius: 3,
                background: captcha ? "#4caf50" : checking ? "#f0f0f0" : "white",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.3s", flexShrink: 0,
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
            <div className="text-right" style={{ opacity: 0.7 }}>
              <div style={{ fontSize: 20 }}>🛡️</div>
              <div style={{ fontSize: 9, color: "#555", lineHeight: 1.3 }}>reCAPTCHA</div>
              <div style={{ fontSize: 8, color: "#999" }}>Privacidad · Términos</div>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-3 bg-[#c9a84c] text-[#0a1628] rounded-lg font-bold hover:bg-[#e4c97a] transition disabled:opacity-50">
            {loading ? "Ingresando..." : "Ingresar"}
          </button>

          <div className="text-center">
            <Link href="/recuperar-clave" className="text-sm text-[#a8b4c8] hover:text-[#c9a84c] transition">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          <p className="text-center text-sm text-[#a8b4c8]">
            ¿No tienes cuenta?{" "}
            <Link href="/registro" className="text-[#c9a84c] hover:underline">Crear cuenta</Link>
          </p>
        </form>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
