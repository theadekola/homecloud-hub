# Rebuild the upstream release with the patched HTTP/2 dependency. Go's module
# checksum database validates downloaded modules; CI scans the resulting binary.
FROM golang:1.27.3-alpine AS builder
WORKDIR /build
RUN go mod init iclusters.local/caddy-build \
 && go get github.com/caddyserver/caddy/v2/cmd/caddy@v2.11.7 \
 && go get golang.org/x/net@v0.60.0 \
 && CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/caddy github.com/caddyserver/caddy/v2/cmd/caddy

FROM caddy:2.11.7-alpine
RUN apk upgrade --no-cache
COPY --from=builder /out/caddy /usr/bin/caddy
LABEL org.opencontainers.image.authors="The Adekola" org.opencontainers.image.vendor="ATT-Tech"
