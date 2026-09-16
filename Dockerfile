# syntax=docker/dockerfile:1
# Gunny · Chibi Arena — the game needs its own server for lobbies, rooms and
# live matches, so the image runs Node and serves the static files itself.
# Hosted at gunny.lazybutts.com behind the Lazybutts hub's caddy + sablier,
# which must forward WebSocket upgrades on /ws.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.html style.css ./
COPY src ./src
COPY server ./server
COPY assets ./assets
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --start-period=2s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server/server.js"]
