# ---------- build stage ----------
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl

# The schema must be present before `npm ci`: its postinstall runs `prisma generate`.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

# ---------- runtime stage ----------
FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000

# Apply pending migrations, seed reference data, then start the API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/prisma/seed.js && node dist/src/main.js"]
