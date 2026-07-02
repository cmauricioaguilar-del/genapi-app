"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const PLANES = ["STARTER", "PROFESIONAL", "BUSINESS"];

export default function Registro() {
  const router = useRouter();
  const [form, setForm] = useState({ nombre: "", email: "", clave: "", plan: "STARTER" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/registro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.ok) {
      router.push("/dashboard");
    } else {
      setError(data.error ?? "Error al crear cuenta.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a1628] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-[#c9a84c]">GENAPI</Link>
          <p className="text-[#a8b4c8] mt-2">Crea tu cuenta y empieza a integrar el SII</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-[#112240] rounded-xl p-8 border border-white/10 space-y-4">
          <div>
            <label className="block text-sm text-[#a8b4c8] mb-1">Nombre</label>
            <input type="text" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              className="w-full px-4 py-3 bg-[#0a1628] border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#c9a84c]"
              placeholder="Tu nombre o empresa" />
          </div>
          <div>
            <label className="block text-sm text-[#a8b4c8] mb-1">Email</label>
            <input type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full px-4 py-3 bg-[#0a1628] border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#c9a84c]"
              placeholder="tu@email.com" />
          </div>
          <div>
            <label className="block text-sm text-[#a8b4c8] mb-1">Contraseña</label>
            <input type="password" required minLength={8} value={form.clave} onChange={e => setForm(f => ({ ...f, clave: e.target.value }))}
              className="w-full px-4 py-3 bg-[#0a1628] border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#c9a84c]"
              placeholder="Mínimo 8 caracteres" />
          </div>
          <div>
            <label className="block text-sm text-[#a8b4c8] mb-1">Plan</label>
            <select value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
              className="w-full px-4 py-3 bg-[#0a1628] border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#c9a84c]">
              {PLANES.map(p => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
            </select>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3 bg-[#c9a84c] text-[#0a1628] rounded-lg font-bold hover:bg-[#e4c97a] transition disabled:opacity-50">
            {loading ? "Creando cuenta..." : "Crear cuenta"}
          </button>
          <p className="text-center text-sm text-[#a8b4c8]">
            ¿Ya tienes cuenta? <Link href="/login" className="text-[#c9a84c] hover:underline">Iniciar sesión</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
