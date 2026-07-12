"use client";

import { useState } from "react";

interface Empresa {
  id: string;
  nombre: string;
  rut: string;
  webhookUrl: string | null;
  webhookSecret: string | null;
}

function genSecret() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function WebhookForm({ empresas }: { empresas: Empresa[] }) {
  const [empresaId, setEmpresaId] = useState(empresas[0]?.id ?? "");
  const empresa = empresas.find(e => e.id === empresaId) ?? empresas[0];

  const [url, setUrl] = useState(empresa?.webhookUrl ?? "");
  const [secret, setSecret] = useState(empresa?.webhookSecret ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function handleEmpresaChange(id: string) {
    setEmpresaId(id);
    const e = empresas.find(x => x.id === id);
    setUrl(e?.webhookUrl ?? "");
    setSecret(e?.webhookSecret ?? "");
    setMsg(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/dashboard/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId, webhookUrl: url.trim(), webhookSecret: secret.trim() }),
      });
      const data = await res.json();
      if (res.ok) setMsg({ ok: true, text: "Configuración guardada correctamente." });
      else setMsg({ ok: false, text: data.error ?? "Error al guardar." });
    } catch {
      setMsg({ ok: false, text: "Error de conexión." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="bg-[#112240] rounded-xl border border-white/10 p-6 space-y-5">
      {empresas.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-[#a8b4c8] mb-2">Empresa</label>
          <select
            value={empresaId}
            onChange={ev => handleEmpresaChange(ev.target.value)}
            className="w-full bg-[#0a1628] border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#c9a84c]"
          >
            {empresas.map(e => (
              <option key={e.id} value={e.id}>{e.nombre} ({e.rut})</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-[#a8b4c8] mb-2">URL del webhook</label>
        <input
          type="url"
          value={url}
          onChange={ev => setUrl(ev.target.value)}
          placeholder="https://tudominio.com/api/webhook/genapi"
          className="w-full bg-[#0a1628] border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4a5568] focus:outline-none focus:border-[#c9a84c]"
        />
        <p className="text-xs text-[#a8b4c8] mt-1.5">
          Debe ser una URL pública que acepte <code className="text-white">POST</code> con{" "}
          <code className="text-white">Content-Type: application/json</code>.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-[#a8b4c8] mb-2">Secret <span className="text-xs font-normal">(opcional)</span></label>
        <div className="flex gap-2">
          <input
            type="text"
            value={secret}
            onChange={ev => setSecret(ev.target.value)}
            placeholder="Dejar en blanco para no usar secret"
            className="flex-1 bg-[#0a1628] border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white font-mono placeholder-[#4a5568] focus:outline-none focus:border-[#c9a84c]"
          />
          <button
            type="button"
            onClick={() => setSecret(genSecret())}
            className="px-4 py-2 text-xs border border-white/20 rounded-lg text-[#a8b4c8] hover:text-white hover:border-white/40 transition whitespace-nowrap"
          >
            ⟳ Generar
          </button>
        </div>
        <p className="text-xs text-[#a8b4c8] mt-1.5">
          Si lo configuras, se enviará en el header <code className="text-white">X-Webhook-Secret</code> para que puedas validar que el request viene de GENAPI.
        </p>
      </div>

      {msg && (
        <div className={`text-sm px-4 py-3 rounded-lg ${msg.ok ? "bg-green-900/30 text-green-400 border border-green-500/20" : "bg-red-900/30 text-red-400 border border-red-500/20"}`}>
          {msg.text}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="px-6 py-2.5 bg-[#c9a84c] text-[#0a1628] rounded-lg text-sm font-bold hover:bg-[#e4c97a] transition disabled:opacity-60"
      >
        {saving ? "Guardando..." : "✓ Guardar"}
      </button>
    </form>
  );
}
