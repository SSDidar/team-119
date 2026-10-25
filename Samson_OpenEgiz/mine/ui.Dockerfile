FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* tsconfig.json vite.config.ts index.html ./
RUN npm install
COPY mine/ui ./mine/ui
COPY public ./public
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY mine/ui/server.mjs ./mine/ui/server.mjs
EXPOSE 8088
CMD ["node", "mine/ui/server.mjs"]
