# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Mantém node_modules completo (inclui o CLI do prisma, necessário para
# "prisma migrate deploy" no startup do container).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./
# schema.prisma não declara `url` — no Prisma 7 a datasource do CLI vem daqui.
# Sem este arquivo, "prisma migrate deploy" falha com
# "The datasource.url property is required in your Prisma config file".
COPY --from=builder /app/prisma.config.ts ./

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
