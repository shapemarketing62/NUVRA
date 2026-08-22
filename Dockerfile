# syntax=docker/dockerfile:1.7
FROM mcr.microsoft.com/playwright:v1.62.1-noble AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM dependencies AS builder
ARG APP_VERSION=0.1.0
ARG COMMIT_SHA=unknown
ARG BUILD_DATE=unknown
ENV APP_VERSION=$APP_VERSION COMMIT_SHA=$COMMIT_SHA BUILD_DATE=$BUILD_DATE NEXT_TELEMETRY_DISABLED=1 APP_ENV=development DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build EMAIL_PROVIDER=development BILLING_PROVIDER=mock
COPY . .
RUN node scripts/prepare-postgres.js && sed -i '/output.*generated\/postgresql-client/d' prisma/postgresql/schema.prisma && npx prisma generate --schema prisma/postgresql/schema.prisma && npm run build

FROM mcr.microsoft.com/playwright:v1.62.1-noble AS runtime
ARG APP_VERSION=0.1.0
ARG COMMIT_SHA=unknown
ARG BUILD_DATE=unknown
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright APP_VERSION=$APP_VERSION COMMIT_SHA=$COMMIT_SHA BUILD_DATE=$BUILD_DATE
COPY --from=builder --chown=pwuser:pwuser /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=pwuser:pwuser /app/node_modules ./node_modules
COPY --from=builder --chown=pwuser:pwuser /app/.next ./.next
COPY --from=builder --chown=pwuser:pwuser /app/next.config.js ./next.config.js
COPY --from=builder --chown=pwuser:pwuser /app/prisma ./prisma
COPY --from=builder --chown=pwuser:pwuser /app/scripts ./scripts
COPY --from=builder --chown=pwuser:pwuser /app/jobs ./jobs
COPY --from=builder --chown=pwuser:pwuser /app/lib ./lib
COPY --from=builder --chown=pwuser:pwuser /app/services ./services
COPY --from=builder --chown=pwuser:pwuser /app/tsconfig.json ./tsconfig.json
USER pwuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm","run","start"]
