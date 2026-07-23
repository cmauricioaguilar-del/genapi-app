"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RestablecerClave({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [clave, setClave]       = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [exito, setExito]       = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (clave.length < 8) { setError("La contraseña debe tener al menos 8 caracteres."); return; }
    if (clave !== confirmar) { setError("Las contraseñas no coinciden."); return; }

    setLoading(true);
    try {
      const res = await fetch(`/api/auth/recuperar/${params.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave }),
      });
      const data = await res.json();
      if (data.ok) {
        setExito(true);
        setTimeout(() => router.push("/login"), 2500);
      } else {
        setError(data.error ?? "Error al restablecer la contraseña.");
      }
    } catch {
      setError("Error de conexión. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a1628] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-[#c9a84c]">GENAPI</Link>
          <p className="text-[#a8b4c8] mt-2">Nueva contraseña</p>
        </div>
        <div className="bg-[#112240] rounded-xl p-8 border border-white/10">
          {exito ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">✅</div>
              <p className="text-white font-semibold">¡Contraseña actualizada!</p>
              <p className="text-[#a8b4c8] text-sm">Redirigiendo al login...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-[#a8b4c8] mb-1">Nueva contraseña</label>
                <input
                  type="password" required value={clave} onChange={e => setClave(e.target.value)}
                  className="w-full px-4 py-3 bg-[#0a1628] border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#c9a84c]"
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
              <div>
                <label className="block text-sm text-[#a8b4c8] mb-1">Confirmar contraseña</label>
                <input
                  type="password" required value={confirmar} onChange={e => setConfirmar(e.target.value)}
                  className="w-full px-4 py-3 bg-[#0a1628] border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#c9a84c]"
                  placeholder="Repite la contraseña"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full py-3 bg-[#c9a84c] text-[#0a1628] rounded-lg font-bold hover:bg-[#e4c97a] transition disabled:opacity-50">
                {loading ? "Guardando..." : "Guardar nueva contraseña"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
