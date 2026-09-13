FROM node:24-alpine AS build
RUN npm install --global pnpm@10.18.0
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @ndms/api

COPY apps/api apps/api
RUN pnpm --filter @ndms/api build \
 && pnpm --filter @ndms/api deploy --prod --legacy /deploy

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy/package.json ./
COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
