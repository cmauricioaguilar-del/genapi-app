import { decrypt } from "./encryption";

export interface F29SII {
  periodo: string;
  iva_debito: number;
  iva_credito: number;
  iva_remanente: number;
  iva_neto: number;
  retencion_honorarios: number;
  ppm: number;
  total_pagar: number;
  raw?: any;
}

export interface F29Result {
  ok: boolean;
  f29?: F29SII;
  error?: string;
}

function normalizarRut(rut: string): string {
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}

function formatearRutConPuntos(rutDigitos: string): string {
  const len = rutDigitos.length;
  if (len <= 3) return rutDigitos;
  if (len <= 6) return rutDigitos.slice(0, len - 3) + "." + rutDigitos.slice(len - 3);
  return rutDigitos.slice(0, len - 6) + "." + rutDigitos.slice(len - 6, len - 3) + "." + rutDigitos.slice(len - 3);
}

async function logoutSII(cookies: string): Promise<void> {
  try {
    await fetch("https://homer.sii.cl/cgi_AUT2000/autCTermino.cgi", {
      headers: { "Cookie": cookies, "Referer": "https://homer.sii.cl/", "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
    });
  } catch { /* ignorar */ }
  try {
    await fetch("https://zeusr.sii.cl/cgi_AUT2000/CAutTermino.cgi", {
      headers: { "Cookie": cookies, "Referer": "https://zeusr.sii.cl/", "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
    });
  } catch { /* ignorar */ }
}

async function loginSII(rutDigitos: string, dv: string, clave: string): Promise<string | null> {
  const rutConPuntos = formatearRutConPuntos(rutDigitos) + "-" + dv;
  const baseHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    "Accept-Language": "es-CL,es;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };

  const getResp = await fetch("https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html", { headers: baseHeaders });
  const getCookies = getResp.headers.getSetCookie ? getResp.headers.getSetCookie() : [];
  const cookieJar = getCookies.map((c) => c.split(";")[0]).join("; ");
  await getResp.text();

  const formBody = new URLSearchParams({ rut: rutDigitos, dv, referencia: "https://homer.sii.cl/", "411": "", rutcntr: rutConPuntos, clave }).toString();

  const postResp = await fetch("https://zeusr.sii.cl/cgi_AUT2000/CAutInicio.cgi", {
    method: "POST",
    headers: { ...baseHeaders, "Content-Type": "application/x-www-form-urlencoded", "Origin": "https://zeusr.sii.cl", "Referer": "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html", "Cookie": cookieJar },
    body: formBody,
    redirect: "follow",
  });

  const postCookies = postResp.headers.getSetCookie ? postResp.headers.getSetCookie() : [];
  const allCookies = [...getCookies, ...postCookies].map((c) => c.split(";")[0]);
  const hasAuth = allCookies.some((c) => c.startsWith("TOKEN=") || c.startsWith("CSESSIONID=") || c.startsWith("NETSCAPE_LIVEWIRE"));
  await postResp.text();

  return hasAuth ? allCookies.join("; ") : null;
}

export async function extraerF29(siiRut: string, siiClaveEnc: string, period: string): Promise<F29Result> {
  const clave = decrypt(siiClaveEnc);
  const rutNormalizado = normalizarRut(siiRut);
  const rutDigitos = rutNormalizado.slice(0, -1);
  const dv = rutNormalizado.slice(-1);
  const anio = period.slice(0, 4);
  const mes = period.slice(4, 6);

  try {
    const cookies = await loginSII(rutDigitos, dv, clave);
    if (!cookies) return { ok: false, error: "No se pudo autenticar en el SII." };

    const payload = {
      rutContribuyente: rutDigitos,
      dvContribuyente: dv,
      periodoTributario: `${anio}-${mes}`,
    };
    const siiHeaders = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*",
      "Origin": "https://www4.sii.cl",
      "Referer": "https://www4.sii.cl/f29ui/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      "Cookie": cookies,
    };

    // Primero intentar con el endpoint de declaración (F29 ya presentado)
    const respDeclaracion = await fetch("https://www4.sii.cl/f29ui/services/data/facadeService/getDeclaracion", {
      method: "POST",
      headers: siiHeaders,
      body: JSON.stringify(payload),
    });

    if (respDeclaracion.ok) {
      const json = await respDeclaracion.json();
      const f29 = parsearF29(json, period);
      await logoutSII(cookies);
      return { ok: true, f29 };
    }

    // Si no hay declaración, intentar con propuesta (mes actual aún no declarado)
    const respPropuesta = await fetch("https://www4.sii.cl/f29ui/services/data/facadeService/getPropuesta", {
      method: "POST",
      headers: siiHeaders,
      body: JSON.stringify(payload),
    });

    if (!respPropuesta.ok) {
      const body = await respPropuesta.text().catch(() => "");
      console.error(`F29 SII declaracion=${respDeclaracion.status} propuesta=${respPropuesta.status}: ${body.substring(0, 300)}`);
      await logoutSII(cookies);
      return { ok: false, error: `SII respondió ${respPropuesta.status} al obtener F29` };
    }

    const json = await respPropuesta.json();
    const f29 = parsearF29(json, period);
    await logoutSII(cookies);
    return { ok: true, f29 };
  } catch (e: any) {
    console.error("Error extracción F29 SII:", e);
    return { ok: false, error: `Error al conectar con el SII: ${e.message}` };
  }
}

function parsearF29(json: any, period: string): F29SII {
  // El SII devuelve la propuesta F29 con campos que varían por versión de la UI.
  // Mapeamos los campos más comunes encontrados en la API.
  const d = json?.data ?? json ?? {};

  const ivaDebito = num(d.ivaDebito ?? d.iva_debito ?? d.montoIvaDebito ?? d.codigos?.["20"] ?? 0);
  const ivaCredito = num(d.ivaCredito ?? d.iva_credito ?? d.montoIvaCredito ?? d.codigos?.["24"] ?? 0);
  const ivaRemanente = num(d.ivaRemanente ?? d.iva_remanente ?? d.remanente ?? d.codigos?.["27"] ?? 0);
  const ivaNeto = num(d.ivaNeto ?? d.iva_neto ?? (ivaDebito - ivaCredito - ivaRemanente));
  const retencionHonorarios = num(d.retencionHonorarios ?? d.retencion_honorarios ?? d.codigos?.["111"] ?? 0);
  const ppm = num(d.ppm ?? d.pagoPpm ?? d.codigos?.["63"] ?? 0);
  const totalPagar = num(d.totalPagar ?? d.total_pagar ?? d.totalAPagar ?? 0);

  return {
    periodo: period,
    iva_debito: ivaDebito,
    iva_credito: ivaCredito,
    iva_remanente: ivaRemanente,
    iva_neto: ivaNeto > 0 ? ivaNeto : Math.max(0, ivaDebito - ivaCredito - ivaRemanente),
    retencion_honorarios: retencionHonorarios,
    ppm,
    total_pagar: totalPagar,
    raw: json,
  };
}

function num(v: any): number {
  return parseInt(String(v ?? "0").replace(/[^0-9-]/g, ""), 10) || 0;
}
