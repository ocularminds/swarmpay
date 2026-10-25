FROM node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY run.mjs demo-policy.mjs ./
RUN mkdir -p /var/lib/agentsafe/evidence && chown -R node:node /var/lib/agentsafe
USER node
CMD ["node","run.mjs"]
