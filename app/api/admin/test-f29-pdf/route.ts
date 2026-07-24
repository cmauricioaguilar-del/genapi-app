import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { chromium } from "playwright";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function normalizarRut(rut: string): string {
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}
function formatearRutConPuntos(rutDigitos: string): string {
  const len = rutDigitos.length;
  if (len <= 3) return rutDigitos;
  if (len <= 6) return rutDigitos.slice(0, len - 3) + "." + rutDigitos.slice(len - 3);
  return rutDigitos.slice(0, len - 6) + "." + rutDigitos.slice(len - 6, len - 3) + "." + rutDigitos.slice(len - 3);
}

// Parsea el string table de una respuesta GWT-RPC //OK[..., [...strings...]]
// Retorna todos los strings del string table y los números del array principal
function parsearGwtRpc(body: string): { strings: string[]; numeros: number[] } {
  try {
    // El formato es: //OK[n1,n2,...,nN,[str1,str2,...,strM]]
    const stripped = body.replace(/^\/\/OK\[/, "").replace(/\]\s*$/, "");

    // El string table es el último elemento: [str1,"str2",...]
    const strTableMatch = stripped.match(/,\[([^\]]*)\]$/);
    if (!strTableMatch) return { strings: [], numeros: [] };

    const strTableRaw = strTableMatch[1];
    const strings = strTableRaw.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
      .map(s => s.replace(/^"|"$/g, ""));

    // Los números son todo lo que viene antes del string table
    const mainPart = stripped.slice(0, stripped.length - strTableMatch[0].length);
    const numeros = mainPart.split(",").map(n => parseInt(n, 10)).filter(n => !isNaN(n));

    return { strings, numeros };
  } catch {
    return { strings: [], numeros: [] };
  }
}

// Extrae posibles folios y períodos del string table GWT
function extraerFoliosPorPeriodo(strings: string[]): Map<string, { folio: string; codInt: string }> {
  const result = new Map<string, { folio: string; codInt: string }>();

  // Buscar strings que parezcan períodos YYYYMM (ej: "202601", "202501")
  // y strings que parezcan folios (números de 8-12 dígitos)
  const periodos = strings.filter(s => /^20\d{2}(0[1-9]|1[0-2])$/.test(s));
  const folios = strings.filter(s => /^\d{8,12}$/.test(s));

  console.log(`[F29 GWT] Períodos encontrados en string table: ${JSON.stringify(periodos)}`);
  console.log(`[F29 GWT] Posibles folios: ${JSON.stringify(folios)}`);

  // Intentar asociar cada período con un folio buscando proximidad en el string table
  for (const periodo of periodos) {
    const idxPeriodo = strings.indexOf(periodo);
    // Buscar folio cercano (±5 posiciones)
    let folio = "";
    let codInt = "";
    for (let offset = -5; offset <= 5; offset++) {
      const candidate = strings[idxPeriodo + offset];
      if (candidate && /^\d{8,12}$/.test(candidate) && candidate !== periodo) {
        if (!folio) folio = candidate;
      }
      if (candidate && /^[A-Z0-9]{1,10}$/.test(candidate) && candidate !== periodo && candidate !== folio) {
        if (!codInt) codInt = candidate;
      }
    }
    if (folio) {
      result.set(periodo, { folio, codInt });
      console.log(`[F29 GWT] Período ${periodo} → folio=${folio} codInt=${codInt}`);
    }
  }

  return result;
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== (process.env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const empresaId = req.nextUrl.searchParams.get("empresaId");
  const period = req.nextUrl.searchParams.get("period") ?? "202601";
  if (!empresaId) return NextResponse.json({ error: "empresaId requerido." }, { status: 400 });

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { nombre: true, siiRut: true, siiClaveEnc: true },
  });
  if (!empresa) return NextResponse.json({ error: "Empresa no encontrada." }, { status: 404 });

  const clave = decrypt(empresa.siiClaveEnc);
  const rutNorm = normalizarRut(empresa.siiRut);
  const rutDigitos = rutNorm.slice(0, -1);
  const dv = rutNorm.slice(-1);
  const rutConPuntos = formatearRutConPuntos(rutDigitos) + "-" + dv;

  const resultado: Record<string, any> = { empresa: empresa.nombre, period };

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
      "--disable-blink-features=AutomationControlled"],
  });

  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      locale: "es-CL",
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      (window as any).chrome = { runtime: {} };
    });
    const page = await context.newPage();

    // 1. LOGIN
    await page.goto("https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html", { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.locator('[name="rutcntr"]').click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type(rutConPuntos, { delay: 80 });
    await page.locator('[name="clave"]').click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type(clave, { delay: 80 });
    await page.evaluate(({ rut, dv }: { rut: string; dv: string }) => {
      const set = (name: string, val: string) => {
        const el = document.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
        if (el) el.value = val;
      };
      set("rut", rut); set("dv", dv); set("referencia", "https://homer.sii.cl/"); set("411", "");
    }, { rut: rutDigitos, dv });
    await page.waitForTimeout(500);
    await Promise.all([
      page.waitForNavigation({ timeout: 15000, waitUntil: "domcontentloaded" }).catch(() => {}),
      page.locator('input[type="submit"], button[type="submit"]').first().click().catch(() =>
        page.evaluate(() => (document.querySelector("form") as HTMLFormElement)?.submit())
      ),
    ]);
    await page.waitForTimeout(3000);

    const cookies = await page.context().cookies();
    const loginOk = cookies.some(c => c.name === "TOKEN" || c.name === "CSESSIONID" || c.name.startsWith("NETSCAPE_LIVEWIRE"));
    resultado.login_ok = loginOk;
    if (!loginOk) {
      await context.close();
      return NextResponse.json({ ...resultado, error: "Login fallido" });
    }

    // 2. NAVEGAR A CONSULTA INTEGRAL — capturar respuesta COMPLETA de svcConsultaInt
    let gwtBody = "";
    const gwtHandler = async (response: import("playwright").Response) => {
      const url = response.url();
      if (url.includes("svcConsultaInt") || url.includes("sdiAAService")) {
        const body = await response.text().catch(() => "");
        if (body.startsWith("//OK")) {
          gwtBody = body;
          console.log(`[F29 GWT] Capturado ${url} len=${body.length}`);
        }
      }
    };
    page.on("response", gwtHandler);

    await page.goto("https://www4.sii.cl/sifmConsultaInternet/index.html?dest=cifxx&form=29", {
      waitUntil: "domcontentloaded", timeout: 30000,
    });
    await page.waitForTimeout(10000);
    page.off("response", gwtHandler);

    resultado.gwt_body_len = gwtBody.length;
    resultado.gwt_body_sample = gwtBody.slice(0, 500);

    // 3. PARSEAR GWT-RPC
    const { strings, numeros } = parsearGwtRpc(gwtBody);
    resultado.gwt_strings_count = strings.length;
    resultado.gwt_strings_all = strings; // todos para diagnóstico
    resultado.gwt_numeros_sample = numeros.slice(0, 30);

    const foliosPorPeriodo = extraerFoliosPorPeriodo(strings);
    resultado.folios_encontrados = Object.fromEntries(foliosPorPeriodo);

    // 4. DESCARGAR PDF DEL PERÍODO SOLICITADO
    const folioData = foliosPorPeriodo.get(period);
    if (!folioData) {
      resultado.error_pdf = `No se encontró folio para período ${period}`;
      resultado.todos_periodos = [...foliosPorPeriodo.keys()];
    } else {
      const { folio, codInt } = folioData;
      resultado.folio = folio;
      resultado.codInt = codInt;

      // Intentar descargar el PDF via formCompacto
      const pdfUrl = `https://www4.sii.cl/rfiInternet/formCompacto?folio=${folio}&rut=${rutDigitos}&form=029&codInt=${codInt}`;
      resultado.pdf_url = pdfUrl;

      // Interceptar la respuesta PDF
      let pdfBytes: Buffer | null = null;
      const pdfHandler = async (response: import("playwright").Response) => {
        const url = response.url();
        if (url.includes("formCompacto") || url.includes("rfiInternet")) {
          const ct = response.headers()["content-type"] ?? "";
          if (ct.includes("pdf") || ct.includes("octet")) {
            const buf = await response.body().catch(() => null);
            if (buf) pdfBytes = buf;
          }
        }
      };
      page.on("response", pdfHandler);

      await page.goto(pdfUrl, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(3000);
      page.off("response", pdfHandler);

      resultado.pdf_url_final = page.url();
      resultado.pdf_content_type = (await page.evaluate(() => document.contentType).catch(() => ""));
      resultado.pdf_bytes_capturados = pdfBytes ? (pdfBytes as Buffer).length : 0;
      resultado.page_html_snippet = (await page.content()).slice(0, 500);

      if (pdfBytes && (pdfBytes as Buffer).length > 1000) {
        resultado.pdf_ok = true;
        resultado.pdf_inicio = (pdfBytes as Buffer).slice(0, 4).toString("ascii"); // "%PDF" si es PDF real
      } else {
        // Intentar fetch directo desde el contexto autenticado
        const fetchResult = await page.evaluate(async (url: string) => {
          try {
            const r = await fetch(url, { credentials: "include" });
            const ct = r.headers.get("content-type") ?? "";
            const ab = await r.arrayBuffer();
            const bytes = new Uint8Array(ab);
            const inicio = String.fromCharCode(...bytes.slice(0, 4));
            return { status: r.status, ct, size: ab.byteLength, inicio };
          } catch (e: any) { return { error: e.message }; }
        }, pdfUrl);
        resultado.pdf_fetch_directo = fetchResult;
      }
    }

    // 5. LOGOUT
    await page.goto("https://zeusr.sii.cl/cgi_AUT2000/autTermino.cgi", { timeout: 8000 }).catch(() => {});
    await context.close();
  } catch (e: any) {
    resultado.error = e.message;
  } finally {
    await browser.close();
  }

  return NextResponse.json(resultado, { status: 200 });
}
