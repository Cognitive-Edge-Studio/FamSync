FROM node:24-bookworm-slim AS build
WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/
RUN npm ci --workspace @famsync/api --include-workspace-root=false --ignore-scripts --no-audit --no-fund

COPY apps/api/tsconfig.json apps/api/
COPY apps/api/src apps/api/src
RUN npm run build --workspace @famsync/api
RUN npm prune --workspace @famsync/api --include-workspace-root=false --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000 NODE_EXTRA_CA_CERTS=/app/certs/supabase-ca.crt
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/dist ./dist
COPY apps/api/certs ./certs
COPY apps/api/package.json ./
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
