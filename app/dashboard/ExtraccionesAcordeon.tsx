"use client";
import { useState } from "react";

const MODULO_LABEL: Record<string, string> = {
  ventas: "Ventas", compras: "Compras", f29: "Form. 29", honorarios: "Honorarios",
};

const ESTADO_BADGE: Record<string, { label: string; dot: string; text: string }> = {
  SUCCESS: { label: "Exitoso",   dot: "bg-green-400",  text: "text-green-400" },
  FAILED:  { label: "Fallido",   dot: "bg-red-400",    text: "text-red-400" },
  RUNNING: { label: "En curso",  dot: "bg-yellow-400", text: "text-yellow-400" },
  PENDING: { label: "Pendiente", dot: "bg-gray-400",   text: "text-gray-400" },
};

function fmtFecha(d: string) {
  return new Date(d).toLocaleDateString("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago",
  });
}

function fmtPeriod(p: string) {
  if (p.length === 6) return `${p.slice(4, 6)}/${p.slice(0, 4)}`;
  return p;
}

type Extraccion = {
  id: string;
  modulo: string;
  period: string;
  estado: string;
  filas: number | null;
  errorMsg: string | null;
  creadoEn: string;
};

type EmpresaData = {
  id: string;
  nombre: string;
  ultimasExtracciones: Extraccion[];
  tieneError: boolean;
  modulosFallidos: string[];
};

export default function ExtraccionesAcordeon({ empresas }: { empresas: EmpresaData[] }) {
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});

  if (empresas.length === 0) {
    return (
      <div className="bg-[#112240] rounded-xl p-10 border border-white/10 text-center text-[#a8b4c8]">
        Aún no hay extracciones registradas. Usa la API para comenzar.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {empresas.map(emp => {
        const abierto = abiertos[emp.id] ?? false;
        return (
          <div key={emp.id} className="bg-[#112240] rounded-xl border border-white/10 overflow-hidden">
            {/* Cabecera colapsable */}
            <button
              onClick={() => setAbiertos(prev => ({ ...prev, [emp.id]: !prev[emp.id] }))}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-[#c9a84c] text-xs">{abierto ? "▼" : "▶"}</span>
                <span className="font-semibold text-white">{emp.nombre}</span>
              </div>
              <div className="flex items-center gap-2">
                {emp.ultimasExtracciones.length === 0 ? (
                  <span className="text-xs text-[#a8b4c8]">Sin extracciones</span>
                ) : emp.tieneError ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-red-400 bg-red-400/10 px-3 py-1 rounded-full border border-red-400/20">
                    ⚠ {emp.modulosFallidos.map(m => MODULO_LABEL[m] ?? m).join(", ")} con error
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-green-400 bg-green-400/10 px-3 py-1 rounded-full border border-green-400/20">
                    ✓ Todo en orden
                  </span>
                )}
              </div>
            </button>

            {/* Detalle expandido */}
            {abierto && emp.ultimasExtracciones.length > 0 && (
              <div className="border-t border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-[#a8b4c8] uppercase tracking-wider bg-white/[0.02]">
                      <th className="text-left px-5 py-2">Módulo</th>
                      <th className="text-left px-4 py-2">Período</th>
                      <th className="text-left px-4 py-2">Estado</th>
                      <th className="text-right px-4 py-2">Registros</th>
                      <th className="text-right px-5 py-2">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emp.ultimasExtracciones.map(ext => {
                      const badge = ESTADO_BADGE[ext.estado] ?? ESTADO_BADGE.PENDING;
                      return (
                        <tr key={ext.id} className="border-t border-white/5 hover:bg-white/5 transition">
                          <td className="px-5 py-3 text-white">{MODULO_LABEL[ext.modulo] ?? ext.modulo}</td>
                          <td className="px-4 py-3 text-[#a8b4c8]">{fmtPeriod(ext.period)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 text-xs ${badge.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}></span>
                              {badge.label}
                            </span>
                            {ext.estado === "FAILED" && ext.errorMsg && (
                              <p className="text-xs text-red-300/70 mt-0.5 max-w-xs truncate">{ext.errorMsg}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-[#a8b4c8]">{ext.filas ?? "—"}</td>
                          <td className="px-5 py-3 text-right text-[#a8b4c8] text-xs">{fmtFecha(ext.creadoEn)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
