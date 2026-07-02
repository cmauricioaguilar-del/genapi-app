"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NuevaEmpresa() {
  const router = useRouter();
  const [form, setForm] = useState({ nombre: "", rut: "", siiRut: "", siiClave: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/dashboard/empresas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.ok) {
      router.push("/dashboard");
    } else {
      setError(data.error ?? "Error al agregar empresa.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a1628] text-[#cdd6e8]">
      <nav className="flex items-center justify-between px-8 py-4 border-b border-white/10">
        <Link href="/dashboard" className="text-xl font-bold text-[#c9a84c]">GENAPI</Link>
      </nav>
      <div className="max-w-lg mx-auto px-8 py-12">
        <div className="mb-8">
          <Link href="/dashboard" className="text-sm text-[#a8b4c8] hover:text-white">← Volver al dashboard</Link>
          <h1 className="text-2xl font-bold text-white mt-4">Conectar empresa al SII</h1>
          <p className="text-[#a8b4c8] mt-1">Tus credenciales se guardan cifradas con AES-256.</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-[#112240] rounded-xl p-8 border border-white/10 space-y-4">
          <div>
            <label className="block text-sm text-[#a8b4c8] mb-1">Nombre de la empresa</label>
            <input type="text" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              className="w-full px-4 py-3 bg-[#0a1628] border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#c9a84c]"
              placeholder="Mi Empresa SpA" />
          </div>
          <div>
            <label className="block text-sm text-[#a8b4c8] mb-1">RUT empresa</label>
            <input type="text" required value={form.rut} onChange={e => setForm(f => ({ ...f, rut: e.target.value }))}
              className="w-full px-4 py-3 bg-[#0a1628] border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#c9a84c]"
              placeholder="76.123.456-7" />
          </div>
          <div>
            <label className="block text-sm text-[#a8b4c8] mb-1">RUT SII (sin puntos ni guión)</label>
            <input type="text" required value={form.siiRut} onChange={e => setForm(f => ({ ...f, siiRut: e.target.value }))}
              className="w-full px-4 py-3 bg-[#0a1628] border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#c9a84c]"
              placeholder="761234567" />
          </div>
          <div>
            <label className="block text-sm text-[#a8b4c8] mb-1">Clave Tributaria SII</label>
            <input type="password" required value={form.siiClave} onChange={e => setForm(f => ({ ...f, siiClave: e.target.value }))}
              className="w-full px-4 py-3 bg-[#0a1628] border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#c9a84c]"
              placeholder="Tu clave del SII" />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3 bg-[#c9a84c] text-[#0a1628] rounded-lg font-bold hover:bg-[#e4c97a] transition disabled:opacity-50">
            {loading ? "Conectando..." : "Conectar empresa"}
          </button>
        </form>
      </div>
    </main>
  );
}
