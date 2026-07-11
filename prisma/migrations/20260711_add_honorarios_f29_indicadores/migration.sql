-- AlterTable: webhooks en empresas
ALTER TABLE "empresas" ADD COLUMN "webhookUrl" TEXT;
ALTER TABLE "empresas" ADD COLUMN "webhookSecret" TEXT;

-- CreateTable: honorarios
CREATE TABLE "honorarios" (
    "id" TEXT NOT NULL,
    "anio" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "fechaEmision" TEXT NOT NULL,
    "rutEmisor" TEXT NOT NULL,
    "nombreEmisor" TEXT NOT NULL,
    "montoBruto" INTEGER NOT NULL DEFAULT 0,
    "retencion" INTEGER NOT NULL DEFAULT 0,
    "montoLiquido" INTEGER NOT NULL DEFAULT 0,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "empresaId" TEXT NOT NULL,
    "extraccionId" TEXT NOT NULL,

    CONSTRAINT "honorarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable: f29_genapi
CREATE TABLE "f29_genapi" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "ivaDebito" INTEGER NOT NULL DEFAULT 0,
    "ivaCredito" INTEGER NOT NULL DEFAULT 0,
    "ivaRemanente" INTEGER NOT NULL DEFAULT 0,
    "ivaNeto" INTEGER NOT NULL DEFAULT 0,
    "retencionHonorarios" INTEGER NOT NULL DEFAULT 0,
    "ppm" INTEGER NOT NULL DEFAULT 0,
    "totalPagar" INTEGER NOT NULL DEFAULT 0,
    "rawData" JSONB,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "empresaId" TEXT NOT NULL,
    "extraccionId" TEXT NOT NULL,

    CONSTRAINT "f29_genapi_pkey" PRIMARY KEY ("id")
);

-- CreateTable: indicadores_economicos
CREATE TABLE "indicadores_economicos" (
    "id" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "fecha" TEXT NOT NULL,

    CONSTRAINT "indicadores_economicos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "f29_genapi_extraccionId_key" ON "f29_genapi"("extraccionId");
CREATE UNIQUE INDEX "indicadores_economicos_periodo_nombre_key" ON "indicadores_economicos"("periodo", "nombre");

-- AddForeignKey
ALTER TABLE "honorarios" ADD CONSTRAINT "honorarios_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "honorarios" ADD CONSTRAINT "honorarios_extraccionId_fkey" FOREIGN KEY ("extraccionId") REFERENCES "extracciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "f29_genapi" ADD CONSTRAINT "f29_genapi_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "f29_genapi" ADD CONSTRAINT "f29_genapi_extraccionId_fkey" FOREIGN KEY ("extraccionId") REFERENCES "extracciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
