FROM node:22-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
RUN npm install
COPY . .
RUN npm run build --workspace=apps/web
RUN npx tsc -b packages/engine/tsconfig.json apps/server/tsconfig.json --noEmit

FROM node:22-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production
ENV PORT=2567
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/server ./apps/server
COPY --from=build /repo/apps/web/dist ./apps/web/dist
COPY --from=build /repo/apps/web/package.json ./apps/web/package.json
EXPOSE 2567
CMD ["npm", "run", "start", "--workspace=apps/server"]
