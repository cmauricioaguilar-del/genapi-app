"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EliminarEmpresa({ empresaId, nombre }: { empresaId: string; nombre: string }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function eliminar() {
    setLoading(true);
    const res = await fetch(`/api/dashboard/empresas/${empresaId}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    } else {
      alert("Error al eliminar la empresa.");
      setLoading(false);
      setConfirming(false);
    }
  }

  if (confirming) return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ fontSize: 12, color: "#f87171" }}>¿Eliminar {nombre}?</span>
      <button onClick={eliminar} disabled={loading} style={{
        background: "#dc2626", color: "#fff", border: "none", borderRadius: 6,
        padding: "6px 12px", fontSize: 12, cursor: "pointer",
      }}>{loading ? "..." : "Sí, eliminar"}</button>
      <button onClick={() => setConfirming(false)} style={{
        background: "transparent", color: "#8899aa", border: "1px solid #1e3a5f",
        borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer",
      }}>Cancelar</button>
    </div>
  );

  return (
    <button onClick={() => setConfirming(true)} style={{
      background: "transparent", color: "#f87171", border: "1px solid #dc262644",
      borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer",
    }}>Eliminar</button>
  );
}
