FROM node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM nginx:1.29.1-alpine@sha256:42a516af16b852e33b7682d5ef8acbd5d13fe08fecadc7ed98605ba5e3b26ab8
ENV SWARM_NGINX_RESOLVER=127.0.0.11 SWARM_TRUSTED_PROXY=127.0.0.1/32 NGINX_ENVSUBST_FILTER=^SWARM_ \
    SWARM_COMMERCE_UPSTREAM=commerce-app:8080 SWARM_EXECUTOR_UPSTREAM=payment-executor:8081 SWARM_VENUE_UPSTREAM=venue:8084
# SWARM_NGINX_RESOLVER=auto takes the container's own DNS server, where a platform doesn't publish one.
COPY --chmod=0755 resolver.envsh /docker-entrypoint.d/15-swarm-resolver.envsh
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY webhook-proxy.conf /etc/nginx/snippets/webhook-proxy.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080 8083
