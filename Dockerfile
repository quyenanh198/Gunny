# syntax=docker/dockerfile:1
# Gunny · Chibi Arena — static webgame (no build step) served by nginx at the
# site root for gunny.lazybutts.com behind the Lazybutts hub's caddy + sablier.
FROM nginx:alpine
COPY index.html style.css /usr/share/nginx/html/
COPY src /usr/share/nginx/html/src
COPY assets /usr/share/nginx/html/assets
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --start-period=2s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
