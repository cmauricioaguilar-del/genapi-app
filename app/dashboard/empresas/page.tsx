import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import EliminarEmpresa from "./EliminarEmpresa";

export default async function EmpresasPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const empresas = await prisma.empresa.findMany({
    where: { clienteId: session.id },
    orderBy: { creadoEn: "asc" },
    select: { id: true, nombre: true, rut: true, apiToken: true, activa: true, creadoEn: true },
  });

  return (
    <div style={{ padding: "40px 48px", maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Mis Empresas</h1>
          <p style={{ fontSize: 13, color: "#8899aa" }}>{empresas.length} empresa{empresas.length !== 1 ? "s" : ""} registrada{empresas.length !== 1 ? "s" : ""}</p>
        </div>
        <Link href="/dashboard/empresas/nueva" style={{
          background: "#c9a84c", color: "#0a0f1a", padding: "10px 20px",
          borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: "none",
        }}>
          + Nueva empresa
        </Link>
      </div>

      {empresas.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", background: "#111827", borderRadius: 12, border: "1px solid #1e3a5f" }}>
          <p style={{ color: "#8899aa" }}>No tienes empresas registradas.</p>
          <Link href="/dashboard/empresas/nueva" style={{ color: "#c9a84c", fontSize: 13 }}>Agregar primera empresa →</Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {empresas.map((e) => (
            <div key={e.id} style={{
              background: "#111827", border: "1px solid #1e3a5f",
              borderRadius: 12, padding: "20px 24px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{e.nombre}</span>
                    <span style={{
                      fontSize: 11, padding: "2px 8px", borderRadius: 4,
                      background: e.activa ? "#16a34a22" : "#dc262622",
                      color: e.activa ? "#4ade80" : "#f87171",
                      border: `1px solid ${e.activa ? "#16a34a44" : "#dc262644"}`,
                    }}>{e.activa ? "Activa" : "Inactiva"}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "#8899aa", marginBottom: 12 }}>RUT: {e.rut}</p>
                  <div style={{ background: "#0a0f1a", border: "1px solid #1e3a5f", borderRadius: 6, padding: "8px 12px" }}>
                    <p style={{ fontSize: 11, color: "#8899aa", marginBottom: 4 }}>API Token</p>
                    <code style={{ fontSize: 12, color: "#c9a84c", wordBreak: "break-all" }}>{e.apiToken}</code>
                  </div>
                </div>
                <EliminarEmpresa empresaId={e.id} nombre={e.nombre} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
