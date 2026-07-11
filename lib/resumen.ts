import { prisma } from "./db";

export interface ResumenPeriodo {
  period: string;
  ventas: {
    total_docs: number;
    monto_neto: number;
    monto_iva: number;
    monto_total: number;
    monto_exento: number;
  };
  compras: {
    total_docs: number;
    monto_neto: number;
    monto_iva: number;
    monto_total: number;
    monto_exento: number;
  };
  honorarios: {
    total_docs: number;
    monto_bruto: number;
    retencion: number;
    monto_liquido: number;
  };
  iva_neto: number;       // iva ventas - iva compras
  retencion_total: number; // retención honorarios del mes
}

export async function calcularResumen(empresaId: string, period: string): Promise<ResumenPeriodo> {
  const anio = period.slice(0, 4);
  const mes = period.slice(4, 6);

  const [ventasAgg, comprasAgg, honorariosAgg] = await Promise.all([
    prisma.venta.aggregate({
      where: { empresaId, period },
      _count: { id: true },
      _sum: { montoNeto: true, montoIva: true, montoTotal: true, montoExento: true },
    }),
    prisma.compra.aggregate({
      where: { empresaId, period },
      _count: { id: true },
      _sum: { montoNeto: true, montoIva: true, montoTotal: true, montoExento: true },
    }),
    prisma.honorario.aggregate({
      where: { empresaId, anio, mes },
      _count: { id: true },
      _sum: { montoBruto: true, retencion: true, montoLiquido: true },
    }),
  ]);

  const ivaVentas = ventasAgg._sum.montoIva ?? 0;
  const ivaCompras = comprasAgg._sum.montoIva ?? 0;

  return {
    period,
    ventas: {
      total_docs: ventasAgg._count.id,
      monto_neto: ventasAgg._sum.montoNeto ?? 0,
      monto_iva: ivaVentas,
      monto_total: ventasAgg._sum.montoTotal ?? 0,
      monto_exento: ventasAgg._sum.montoExento ?? 0,
    },
    compras: {
      total_docs: comprasAgg._count.id,
      monto_neto: comprasAgg._sum.montoNeto ?? 0,
      monto_iva: ivaCompras,
      monto_total: comprasAgg._sum.montoTotal ?? 0,
      monto_exento: comprasAgg._sum.montoExento ?? 0,
    },
    honorarios: {
      total_docs: honorariosAgg._count.id,
      monto_bruto: honorariosAgg._sum.montoBruto ?? 0,
      retencion: honorariosAgg._sum.retencion ?? 0,
      monto_liquido: honorariosAgg._sum.montoLiquido ?? 0,
    },
    iva_neto: ivaVentas - ivaCompras,
    retencion_total: honorariosAgg._sum.retencion ?? 0,
  };
}
