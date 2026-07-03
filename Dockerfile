FROM node:20-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npx prisma generate
RUN npm run build

EXPOSE 3000
ENV PORT=3000
CMD ["sh", "-c", "npx prisma db push --skip-generate 2>/dev/null; npm start"]
