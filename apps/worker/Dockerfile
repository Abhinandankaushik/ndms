FROM node:24-alpine AS build
RUN npm install --global pnpm@10.18.0
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --filter @ndms/worker

COPY apps/worker apps/worker
RUN pnpm --filter @ndms/worker build \
 && pnpm --filter @ndms/worker deploy --prod --legacy /deploy

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy/package.json ./
COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /repo/apps/worker/dist ./dist
USER node
CMD ["node", "dist/main.js"]
