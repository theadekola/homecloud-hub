FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts ./scripts
ARG HOMECLOUD_BUILD_NUMBER
ARG HOMECLOUD_BUILD_DATE
ARG HOMECLOUD_BUILD_REVISION
RUN node scripts/write-build-info.mjs
RUN mkdir -p /app/runtime
ENV PORT=6000
EXPOSE 6000
CMD ["npm","start"]
