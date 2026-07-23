"use client";
import { useState } from "react";
import Link from "next/link";

export default function RecuperarClave() {
  const [email, setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError]   = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await fetch("/api/auth/recuperar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setEnviado(true);
    } catch {
      setError("Error al procesar la solicitud. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a1628] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-[#c9a84c]">GENAPI</Link>
          <p className="text-[#a8b4c8] mt-2">Recuperar contraseña</p>
        </div>
        <div className="bg-[#112240] rounded-xl p-8 border border-white/10">
          {enviado ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">📧</div>
              <p className="text-white font-semibold">Revisa tu correo</p>
              <p className="text-[#a8b4c8] text-sm">
                Si el email está registrado, recibirás un enlace para restablecer tu contraseña. El enlace expira en 1 hora.
              </p>
              <Link href="/login" className="block text-center text-sm text-[#c9a84c] hover:underline mt-4">
                ← Volver al login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-[#a8b4c8] text-sm mb-4">
                Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña.
              </p>
              <div>
                <label className="block text-sm text-[#a8b4c8] mb-1">Email de tu cuenta</label>
                <input
                  type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-[#0a1628] border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#c9a84c]"
                  placeholder="tu@email.com"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full py-3 bg-[#c9a84c] text-[#0a1628] rounded-lg font-bold hover:bg-[#e4c97a] transition disabled:opacity-50">
                {loading ? "Enviando..." : "📧 Enviar enlace de recuperación"}
              </button>
              <p className="text-center text-sm text-[#a8b4c8] mt-2">
                <Link href="/login" className="text-[#a8b4c8] hover:text-[#c9a84c]">← Volver al login</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
