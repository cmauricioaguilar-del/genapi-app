#!/bin/sh
# Baseline la primera migración si la BD ya existía antes de activar migrate deploy.
# Si ya está registrada, el comando falla silenciosamente (|| true).
npx prisma migrate resolve --applied "20260711_add_ventas_compras" 2>/dev/null || true

# Aplica migraciones pendientes (solo la segunda en adelante)
npx prisma migrate deploy

# Arranca Next.js
exec npx next start
