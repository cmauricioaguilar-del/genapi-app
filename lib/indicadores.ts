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
  // mindicador.cl: GET /api/{nombre}/{anio} devuelve serie anual con observaciones mensuales
  // Filtramos por el mes buscado (campo fecha en formato ISO)
  const mesNum = parseInt(mes, 10);

  try {
    const resp = await fetch(`https://mindicador.cl/api/${nombre}/${anio}`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const serie: Array<{ fecha: string; valor: number }> = json?.serie ?? [];
    if (!Array.isArray(serie) || serie.length === 0) return null;

    // Buscar la observación más reciente dentro del mes pedido
    const delMes = serie.filter((e) => {
      const d = new Date(e.fecha);
      return d.getFullYear() === parseInt(anio, 10) && d.getMonth() + 1 === mesNum;
    });
    if (delMes.length > 0) return Number(delMes[0].valor) || null;

    // Para IPC y algunos indicadores la observación del mes puede estar en el mes siguiente;
    // usamos la última observación disponible antes o dentro del mes
    const anteriores = serie.filter((e) => new Date(e.fecha) <= new Date(parseInt(anio, 10), mesNum, 0));
    return anteriores.length > 0 ? Number(anteriores[0].valor) || null : null;
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
