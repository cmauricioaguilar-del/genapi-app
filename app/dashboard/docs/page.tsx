import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DocsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const cliente = await prisma.cliente.findUnique({
    where: { id: session.id },
    include: { empresas: { take: 1 } },
  });
  if (!cliente) redirect("/login");

  const BASE = "https://genapi.cl/api/v1";

  return (
    <div className="min-h-screen bg-[#0a1628] text-[#cdd6e8] flex flex-col">
      {/* HEADER */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-white/10 shrink-0">
        <span className="text-xl font-bold text-[#c9a84c]">GENAPI</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[#a8b4c8]">{cliente.email}</span>
          <span className="text-xs bg-[#c9a84c]/20 text-[#c9a84c] px-2 py-0.5 rounded font-medium">{cliente.plan}</span>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="text-sm text-[#a8b4c8] hover:text-white transition">Salir</button>
          </form>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <aside className="w-56 shrink-0 border-r border-white/10 py-6 px-4 space-y-1">
          <p className="text-xs uppercase tracking-widest text-[#a8b4c8] mb-3 px-2">Menú</p>
          {[
            { href: "/dashboard", label: "Dashboard", icon: "◈" },
            { href: "/dashboard/empresas", label: "Empresas", icon: "⊞" },
            { href: "/dashboard/webhook", label: "Webhook", icon: "⇆" },
            { href: "/dashboard/docs", label: "API Docs", icon: "⟨/⟩", active: true },
          ].map(item => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${item.active ? "bg-[#112240] text-white" : "text-[#cdd6e8] hover:bg-[#112240]"}`}>
              <span className="text-[#c9a84c]">{item.icon}</span> {item.label}
            </Link>
          ))}
        </aside>

        {/* MAIN */}
        <main className="flex-1 overflow-y-auto px-8 py-8 space-y-10 max-w-4xl">
          <div>
            <h1 className="text-2xl font-bold text-white">Documentación API</h1>
            <p className="text-[#a8b4c8] mt-1 text-sm">Referencia completa de la API de GENAPI v1.</p>
          </div>

          {/* AUTENTICACIÓN */}
          <Section title="Autenticación">
            <p className="text-sm text-[#a8b4c8] mb-4">
              Todas las llamadas requieren el header <Code>X-Api-Token</Code> con el token de tu empresa.
              Cada empresa tiene su propio token.
            </p>
            <div className="space-y-3">
              {cliente.empresas.length === 0 ? (
                <p className="text-sm text-[#a8b4c8]">
                  Aún no tienes empresas.{" "}
                  <Link href="/dashboard/empresas/nueva" className="text-[#c9a84c] hover:underline">Agrega una empresa</Link> para obtener tu token.
                </p>
              ) : (
                cliente.empresas.map((emp: { id: string; nombre: string; rut: string; apiToken: string }) => (
                  <div key={emp.id} className="bg-[#0a1628] rounded-lg border border-white/10 p-4">
                    <p className="text-xs text-[#a8b4c8] mb-2">{emp.nombre} — <span className="text-[#c9a84c]">{emp.rut}</span></p>
                    <div className="font-mono text-sm">
                      <span className="text-[#a8b4c8]">X-Api-Token: </span>
                      <span className="text-green-400">{emp.apiToken}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Section>

          {/* VENTAS */}
          <EndpointSection
            method="GET"
            path={`${BASE}/ventas/{period}`}
            title="Registro de Ventas"
            description="Obtiene el RCV de ventas de un período. Retorna las facturas, boletas y notas emitidas por tu empresa registradas en el SII."
            params={[
              { name: "period", where: "path", type: "string", desc: "Período en formato YYYYMM (ej. 202607)" },
            ]}
            curl={`curl -H "X-Api-Token: TU_TOKEN" \\\n     "${BASE}/ventas/202607"`}
            response={`{
  "ok": true,
  "empresa": "Comercial Ejemplo SpA",
  "rut": "76129731-7",
  "period": "202607",
  "total": 45,
  "data": [
    {
      "id": 1001,
      "period": "202607",
      "docType": "33",
      "docNumber": "4521",
      "rutEmisor": "76129731-7",
      "nombreEmisor": "Comercial Ejemplo SpA",
      "rutReceptor": "77888999-0",
      "nombreReceptor": "Cliente SpA",
      "fechaEmision": "05/07/2026",
      "montoNeto": 1500000,
      "montoIva": 285000,
      "montoTotal": 1785000,
      "montoExento": 0,
      "extractedAt": "2026-07-10T08:32:00Z"
    }
  ]
}`}
          />

          {/* COMPRAS */}
          <EndpointSection
            method="GET"
            path={`${BASE}/compras/{period}`}
            title="Registro de Compras"
            description="Obtiene el RCV de compras de un período. Retorna las facturas y documentos recibidos por tu empresa registrados en el SII."
            params={[
              { name: "period", where: "path", type: "string", desc: "Período en formato YYYYMM (ej. 202607)" },
            ]}
            curl={`curl -H "X-Api-Token: TU_TOKEN" \\\n     "${BASE}/compras/202607"`}
            response={`{
  "ok": true,
  "empresa": "Comercial Ejemplo SpA",
  "rut": "76129731-7",
  "period": "202607",
  "total": 22,
  "data": [
    {
      "id": 2001,
      "period": "202607",
      "docType": "33",
      "docNumber": "8901",
      "rutEmisor": "78111222-3",
      "nombreEmisor": "Distribuidora Norte Ltda.",
      "rutReceptor": "76129731-7",
      "nombreReceptor": "Comercial Ejemplo SpA",
      "fechaEmision": "10/07/2026",
      "montoNeto": 850000,
      "montoIva": 161500,
      "montoTotal": 1011500,
      "montoExento": 0,
      "extractedAt": "2026-07-10T08:35:00Z"
    }
  ]
}`}
          />

          {/* HONORARIOS */}
          <EndpointSection
            method="GET"
            path={`${BASE}/honorarios/{anio}`}
            title="Boletas de Honorarios"
            description="Obtiene las boletas de honorarios del año completo registradas en el SII."
            params={[
              { name: "anio", where: "path", type: "string", desc: "Año en formato YYYY (ej. 2026)" },
            ]}
            curl={`curl -H "X-Api-Token: TU_TOKEN" \\\n     "${BASE}/honorarios/2026"`}
            response={`{
  "ok": true,
  "empresa": "Comercial Ejemplo SpA",
  "rut": "76129731-7",
  "anio": "2026",
  "total": 8,
  "data": [
    {
      "id": "bc01bcfb-...",
      "anio": "2026",
      "mes": "01",
      "folio": "00012345",
      "fechaEmision": "15/01/2026",
      "rutEmisor": "12345678-9",
      "nombreEmisor": "Juan Pérez González",
      "montoBruto": 1000000,
      "retencion": 125000,
      "montoLiquido": 875000,
      "extractedAt": "2026-07-10T08:45:00Z"
    }
  ]
}`}
          />

          {/* F29 */}
          <EndpointSection
            method="GET"
            path={`${BASE}/f29/{period}`}
            title="Formulario 29 (IVA)"
            description="Obtiene los datos del F29 de un período: IVA débito, crédito, neto y total a pagar."
            params={[
              { name: "period", where: "path", type: "string", desc: "Período en formato YYYYMM (ej. 202607)" },
            ]}
            curl={`curl -H "X-Api-Token: TU_TOKEN" \\\n     "${BASE}/f29/202607"`}
            response={`{
  "ok": true,
  "empresa": "Comercial Ejemplo SpA",
  "rut": "76129731-7",
  "period": "202607",
  "data": {
    "ivaDebito": 2365500,
    "ivaCredito": 1563700,
    "ivaRemanente": 0,
    "ivaNeto": 801800,
    "retencionHonorarios": 125000,
    "ppm": 320000,
    "totalPagar": 1246800
  }
}`}
          />

          {/* STATUS */}
          <EndpointSection
            method="GET"
            path={`${BASE}/status`}
            title="Estado de la cuenta"
            description="Retorna información de la empresa y el uso del día. Útil para verificar que el token es válido."
            params={[]}
            curl={`curl -H "X-Api-Token: TU_TOKEN" \\\n     "${BASE}/status"`}
            response={`{
  "ok": true,
  "empresa": "Comercial Ejemplo SpA",
  "rut": "76129731-7",
  "plan": "STARTER",
  "consultasHoy": 2,
  "limiteHoy": 3
}`}
          />

          {/* WEBHOOK */}
          <Section title="Webhooks">
            <p className="text-sm text-[#a8b4c8] mb-4">
              Configura una URL en <Link href="/dashboard/webhook" className="text-[#c9a84c] hover:underline">Webhook</Link> para recibir notificaciones automáticas cuando una extracción termine.
            </p>
            <div className="mb-4">
              <p className="text-xs uppercase tracking-widest text-[#a8b4c8] mb-2">Headers enviados</p>
              <Table rows={[
                ["Content-Type", "application/json"],
                ["X-Webhook-Secret", "Tu secret configurado (si aplica)"],
              ]} headers={["Header", "Valor"]} />
            </div>
            <div className="mb-4">
              <p className="text-xs uppercase tracking-widest text-[#a8b4c8] mb-2">Payload</p>
              <Pre>{`{
  "event": "extraction_complete",
  "module": "ventas",
  "rut": "76129731-7",
  "period": "202607",
  "status": "SUCCESS",
  "rows": 45
}`}</Pre>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-[#a8b4c8] mb-2">Validación del secret (Node.js)</p>
              <Pre>{`const secret = req.headers['x-webhook-secret'];
if (secret !== process.env.WEBHOOK_SECRET) {
  return res.sendStatus(401);
}`}</Pre>
            </div>
          </Section>

          {/* ERRORES */}
          <Section title="Códigos de error">
            <Table
              headers={["Código", "Significado", "Ejemplo"]}
              rows={[
                ["401", "Token inválido o no enviado", '{"error": "Token requerido. Incluye el header X-Api-Token."}'],
                ["403", "Cuenta suspendida", '{"error": "Cuenta suspendida."}'],
                ["429", "Límite diario alcanzado", '{"error": "Límite diario alcanzado (3 consultas/día en plan STARTER)."}'],
                ["400", "Parámetros inválidos", '{"error": "Período inválido. Formato requerido: YYYYMM"}'],
                ["502", "Error al conectar con el SII", '{"error": "Error al conectar con el SII."}'],
              ]}
            />
          </Section>
        </main>
      </div>
    </div>
  );
}

// ─── Componentes ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-4 pb-2 border-b border-white/10">{title}</h2>
      {children}
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="bg-[#112240] text-[#c9a84c] px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>;
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-[#0a1628] border border-white/10 rounded-lg p-4 text-xs font-mono text-[#a8b4c8] overflow-x-auto whitespace-pre">
      {children}
    </pre>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-white/10">
            {headers.map(h => (
              <th key={h} className="text-left py-2 px-3 text-xs uppercase tracking-widest text-[#a8b4c8]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/5">
              {row.map((cell, j) => (
                <td key={j} className={`py-2 px-3 text-xs font-mono ${j === 0 ? "text-[#c9a84c]" : "text-[#cdd6e8]"}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EndpointSection({
  method, path, title, description, params, curl, response,
}: {
  method: string; path: string; title: string; description: string;
  params: { name: string; where: string; type: string; desc: string }[];
  curl: string; response: string;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold bg-green-500/20 text-green-400 px-2 py-1 rounded font-mono">{method}</span>
        <code className="text-sm text-white font-mono">{path}</code>
      </div>
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <p className="text-sm text-[#a8b4c8]">{description}</p>

      {params.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-[#a8b4c8] mb-2">Parámetros</p>
          <Table
            headers={["Nombre", "Ubicación", "Tipo", "Descripción"]}
            rows={params.map(p => [p.name, p.where, p.type, p.desc])}
          />
        </div>
      )}

      <div>
        <p className="text-xs uppercase tracking-widest text-[#a8b4c8] mb-2">Ejemplo cURL</p>
        <Pre>{curl}</Pre>
      </div>

      <div>
        <p className="text-xs uppercase tracking-widest text-[#a8b4c8] mb-2">Respuesta exitosa 200</p>
        <Pre>{response}</Pre>
      </div>

      <div className="border-b border-white/10 pt-2" />
    </section>
  );
}
