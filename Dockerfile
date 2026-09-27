FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3001 DATA_DIR=/data/craftly
COPY package*.json ./
RUN npm ci --omit=dev && mkdir -p /data/craftly && chown -R node:node /data
COPY server ./server
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3001
CMD ["node", "server/index.js"]
