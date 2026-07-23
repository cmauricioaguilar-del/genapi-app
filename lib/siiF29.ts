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

async function fetchSii(url: string, cookies: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...opts,
    headers: {
      "Cookie": cookies,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "es-CL,es;q=0.9",
      ...(opts.headers ?? {}),
    },
    redirect: "follow",
  });
}

async function obtenerFolioF29(cookies: string, rutDigitos: string, dv: string, anio: string, mes: string): Promise<{ folio: string; codInt: string } | null> {
  const periodoSii = `${anio}-${mes}`; // e.g. "2026-01"

  // Paso 1: Página de consulta integral F29
  const resp1 = await fetchSii(
    `https://www4.sii.cl/sifmConsultaInternet/index.html?dest=cifxx&form=29`,
    cookies,
    { headers: { "Referer": "https://www.sii.cl/" } }
  );
  if (!resp1.ok) { console.error(`[F29] sifmConsultaInternet HTTP ${resp1.status}`); return null; }
  const html1 = await resp1.text();
  console.log("[F29] sifmConsultaInternet HTML (primeros 500):", html1.substring(0, 500));

  // Buscar link al período específico (el SII usa links tipo href con el período)
  // Patrones comunes: href="...&PERIODO=2026-01..." o href="...?anio=2026&mes=01..."
  const patterns = [
    new RegExp(`href="([^"]*${anio}[^"]*${mes}[^"]*)"`, "gi"),
    new RegExp(`href="([^"]*${periodoSii}[^"]*)"`, "gi"),
    new RegExp(`href="([^"]*PERIODO[^"]*${anio}${mes}[^"]*)"`, "gi"),
  ];

  let linkPeriodo: string | null = null;
  for (const pat of patterns) {
    const m = pat.exec(html1);
    if (m) { linkPeriodo = m[1]; break; }
  }

  if (!linkPeriodo) {
    // Log más HTML para diagnóstico
    console.error("[F29] No se encontró link para período", periodoSii, "HTML completo (1500):", html1.substring(0, 1500));
    return null;
  }

  const url2 = linkPeriodo.startsWith("http") ? linkPeriodo : `https://www4.sii.cl${linkPeriodo}`;
  const resp2 = await fetchSii(url2, cookies, { headers: { "Referer": "https://www4.sii.cl/sifmConsultaInternet/index.html" } });
  if (!resp2.ok) { console.error(`[F29] Consulta estado HTTP ${resp2.status}`); return null; }
  const html2 = await resp2.text();
  console.log("[F29] Consulta estado HTML (500):", html2.substring(0, 500));

  // Extraer folio y codInt del HTML
  const folioMatch = html2.match(/folio[=\s"]*(\d{6,12})/i);
  const codIntMatch = html2.match(/codInt[=\s"]*(\d{6,12})/i);

  if (!folioMatch) {
    console.error("[F29] No folio en HTML:", html2.substring(0, 1000));
    return null;
  }

  return { folio: folioMatch[1], codInt: codIntMatch?.[1] ?? "" };
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

    // Ruta principal: navegación via sifmConsultaInternet (F29 declarados)
    const folioData = await obtenerFolioF29(cookies, rutDigitos, dv, anio, mes);

    if (folioData) {
      // Fetch datos del formulario compacto via rfiInternet
      const { folio, codInt } = folioData;
      const formUrl = `https://www4.sii.cl/rfiInternet/verDocumento?folio=${folio}&rut=${rutDigitos}&form=029&codInt=${codInt}`;
      const formResp = await fetchSii(formUrl, cookies, {
        headers: { "Referer": "https://www4.sii.cl/sifmConsultaInternet/index.html" },
      });

      if (formResp.ok) {
        const formHtml = await formResp.text();
        console.log("[F29] formDocumento HTML (500):", formHtml.substring(0, 500));
        const f29 = parsearF29Html(formHtml, period);
        if (f29) {
          await logoutSII(cookies);
          return { ok: true, f29 };
        }
      }
    }

    // Fallback: propuesta del SII (mes actual no declarado aún)
    const payload = { rutContribuyente: rutDigitos, dvContribuyente: dv, periodoTributario: `${anio}-${mes}` };
    const siiHeaders = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*",
      "Origin": "https://www4.sii.cl",
      "Referer": "https://www4.sii.cl/f29ui/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      "Cookie": cookies,
    };

    const respPropuesta = await fetch("https://www4.sii.cl/f29ui/services/data/facadeService/getPropuesta", {
      method: "POST", headers: siiHeaders, body: JSON.stringify(payload),
    });

    if (respPropuesta.ok) {
      const json = await respPropuesta.json();
      const f29 = parsearF29(json, period);
      await logoutSII(cookies);
      return { ok: true, f29 };
    }

    const errBody = await respPropuesta.text().catch(() => "");
    console.error(`[F29] propuesta ${respPropuesta.status}: ${errBody.substring(0, 200)}`);
    await logoutSII(cookies);
    return { ok: false, error: `F29 no encontrado para período ${period}` };
  } catch (e: any) {
    console.error("Error extracción F29 SII:", e);
    return { ok: false, error: `Error al conectar con el SII: ${e.message}` };
  }
}

function parsearF29Html(html: string, period: string): F29SII | null {
  // El formCompacto del SII tiene campos con codes como 20, 24, 27, etc.
  // Intentamos extraer por código de línea del formulario
  function extractCode(code: string): number {
    const re = new RegExp(`\\b${code}\\b[^\\d]*([\\d.]+)`, "i");
    const m = html.match(re);
    if (!m) return 0;
    return parseInt(m[1].replace(/\./g, ""), 10) || 0;
  }

  // Códigos estándar F29: 20=IVA débito, 24=IVA crédito, 27=remanente, 63=PPM, 91=total
  const ivaDebito = extractCode("20");
  const ivaCredito = extractCode("24");
  const ivaRemanente = extractCode("27");
  const ppm = extractCode("63");
  const total = extractCode("91");

  // Si no encontramos ningún dato útil, retornar null para que intente otro método
  if (ivaDebito === 0 && ivaCredito === 0 && ppm === 0 && total === 0) {
    console.error("[F29] parsearF29Html: no se encontraron datos en HTML (500):", html.substring(0, 500));
    return null;
  }

  const ivaNeto = Math.max(0, ivaDebito - ivaCredito - ivaRemanente);
  return {
    periodo: period,
    iva_debito: ivaDebito,
    iva_credito: ivaCredito,
    iva_remanente: ivaRemanente,
    iva_neto: ivaNeto,
    retencion_honorarios: extractCode("111"),
    ppm,
    total_pagar: total,
    raw: html.substring(0, 2000),
  };
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
