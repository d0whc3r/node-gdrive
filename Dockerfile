FROM node:26-trixie-slim AS builder

RUN npm install --ignore-scripts -g pnpm@12.16.1

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.build.json vite.config.mts vite.cli.config.mts vite.sea.config.mts ./
COPY scripts/ /app/scripts
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY src/ /app/src
COPY cli/ /app/cli
RUN pnpm build

FROM debian:trixie-slim AS base

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

FROM debian:trixie-slim AS mongo-tools

ARG TARGETARCH
ARG MONGO_TOOLS_VERSION=100.14.1

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl tar && \
    rm -rf /var/lib/apt/lists/* && \
    if [ "$TARGETARCH" = "amd64" ]; then \
      URL="https://fastdl.mongodb.org/tools/db/mongodb-database-tools-debian12-x86_64-${MONGO_TOOLS_VERSION}.tgz"; \
    elif [ "$TARGETARCH" = "arm64" ]; then \
      URL="https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2204-arm64-${MONGO_TOOLS_VERSION}.tgz"; \
    else \
      echo "Unsupported architecture: $TARGETARCH" >&2; exit 1; \
    fi && \
    curl -fsSL "$URL" -o /tmp/mongo-tools.tgz && \
    tar -xzf /tmp/mongo-tools.tgz --strip-components=2 -C /usr/local/bin --wildcards '*/bin/mongodump' && \
    chmod 0755 /usr/local/bin/mongodump && \
    rm -f /tmp/mongo-tools.tgz

FROM base AS db

USER root

RUN apt-get update && \
    apt-get install -y --no-install-recommends postgresql-client mariadb-client && \
    rm -rf /var/lib/apt/lists/*

COPY --from=mongo-tools /usr/local/bin/mongodump /usr/local/bin/mongodump

USER 10001

FROM base AS slim
