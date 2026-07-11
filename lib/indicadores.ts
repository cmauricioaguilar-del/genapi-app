import { prisma } from "./db";

export interface IndicadoresPeriodo {
  periodo: string;
  uf: number | null;
  utm: number | null;
  dolar: number | null;
  euro: number | null;
  ipc: number | null;
}

const INDICADORES = ["uf", "utm", "dolar", "euro", "ipc"] as const;
type NombreIndicador = typeof INDICADORES[number];

async function fetchIndicador(nombre: NombreIndicador, anio: string, mes: string): Promise<number | null> {
  // mindicador.cl: GET /api/{nombre}/{dd-mm-yyyy}
  // Para período mensual usamos el último día del mes
  const ultimoDia = new Date(parseInt(anio), parseInt(mes), 0).getDate();
  const fecha = `${String(ultimoDia).padStart(2, "0")}-${mes}-${anio}`;

  try {
    const resp = await fetch(`https://mindicador.cl/api/${nombre}/${fecha}`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const serie = json?.serie;
    if (Array.isArray(serie) && serie.length > 0) {
      return Number(serie[0].valor) || null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function obtenerIndicadores(period: string): Promise<IndicadoresPeriodo> {
  const anio = period.slice(0, 4);
  const mes = period.slice(4, 6);

  // Intentar desde caché en BD primero
  const cached = await prisma.indicadorEconomico.findMany({
    where: { periodo: period, nombre: { in: [...INDICADORES] } },
  });

  const result: Record<string, number | null> = {};
  for (const ind of INDICADORES) {
    const c = cached.find((x) => x.nombre === ind);
    result[ind] = c ? c.valor : null;
  }

  // Fetchear los que falten
  const faltantes = INDICADORES.filter((ind) => result[ind] === null);
  if (faltantes.length > 0) {
    const valores = await Promise.all(faltantes.map((ind) => fetchIndicador(ind, anio, mes)));

    for (let i = 0; i < faltantes.length; i++) {
      const ind = faltantes[i];
      const valor = valores[i];
      result[ind] = valor;

      if (valor !== null) {
        // Guardar en caché (ignorar duplicado si ya existe)
        await prisma.indicadorEconomico.upsert({
          where: { periodo_nombre: { periodo: period, nombre: ind } },
          create: { periodo: period, nombre: ind, valor, fecha: `${mes}-${anio}` },
          update: { valor },
        });
      }
    }
  }

  return {
    periodo: period,
    uf: result.uf,
    utm: result.utm,
    dolar: result.dolar,
    euro: result.euro,
    ipc: result.ipc,
  };
}
