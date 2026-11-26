FROM node:26-trixie-slim AS builder

RUN npm install -g pnpm@12.16.1

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.build.json vite.config.mts vite.cli.config.mts vite.sea.config.mts ./
COPY scripts/ /app/scripts
RUN pnpm install --frozen-lockfile

COPY src/ /app/src
COPY cli/ /app/cli
RUN pnpm build

FROM debian:trixie-slim

ENV TOKEN_FILE=/app/secrets/token.json
ENV CREDENTIALS_FILE=/app/secrets/credentials.json

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    useradd --uid 10001 --create-home --shell /usr/sbin/nologin appuser && \
    mkdir -p /app/secrets && \
    chown -R appuser:appuser /app

COPY --from=builder --chown=appuser:appuser /app/node-gdrive /app/node-gdrive
RUN chmod 0755 /app/node-gdrive

WORKDIR /app
USER 10001

ENTRYPOINT ["/app/node-gdrive"]
