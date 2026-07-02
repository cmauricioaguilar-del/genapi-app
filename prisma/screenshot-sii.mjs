import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const browser = await puppeteer.launch({
  headless: false,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--lang=es-CL"],
});

const page = await browser.newPage();
await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
await page.setViewport({ width: 1280, height: 800 });

// Obtener href del botón Ingresar a Mi SII
await page.goto("https://homer.sii.cl", { waitUntil: "networkidle2", timeout: 30000 });

const loginHref = await page.$eval(
  'a',
  (els) => {
    // Buscar el link que contiene "Ingresar" en el texto
    const links = Array.from(document.querySelectorAll('a'));
    const loginLink = links.find(a => a.textContent.toLowerCase().includes('ingresar'));
    return loginLink ? loginLink.href : null;
  }
).catch(() => null);

console.log("Link de login encontrado:", loginHref);

// Navegar directo a la página de login
await page.goto("https://zeusr.sii.cl//AUT2000/InicioAutenticacion/IngresoRutClave.html", { waitUntil: "networkidle2", timeout: 30000 });
await page.screenshot({ path: "sii-login.png", fullPage: true });
console.log("URL login:", page.url());

const inputs = await page.$$eval("input", els => els.map(e => ({ name: e.name, id: e.id, type: e.type })));
console.log("Inputs:", JSON.stringify(inputs, null, 2));

await browser.close();
