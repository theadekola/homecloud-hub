FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN apk upgrade --no-cache \
 && npm ci --omit=dev \
 && rm -rf /usr/local/lib/node_modules /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/corepack
COPY src ./src
COPY scripts ./scripts
ARG HOMECLOUD_BUILD_NUMBER
ARG HOMECLOUD_BUILD_DATE
ARG HOMECLOUD_BUILD_REVISION
RUN node scripts/write-build-info.mjs
RUN mkdir -p /app/runtime
ENV PORT=6000
EXPOSE 6000
LABEL org.opencontainers.image.authors="The Adekola" org.opencontainers.image.vendor="ATT-Tech"
CMD ["node","src/server.js"]
