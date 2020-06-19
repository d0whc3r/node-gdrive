FROM node:12 AS builder

ENV NODE_OPTIONS "--max_old_space_size=2048"

COPY package.json yarn.lock tsconfig.json rollup.config.js /app/
WORKDIR /app

RUN yarn install
COPY src/ /app/src
COPY cli/ /app/cli
RUN yarn build

FROM bitnami/minideb

ENV TOKEN_FILE=/app/secrets/token.json
ENV CREDENTIALS_FILE=/app/secrets/credentials.json

COPY --from=builder /app/node-gdrive /app/node-gdrive
RUN chmod +x /app/node-gdrive
WORKDIR /app

ENTRYPOINT ["/app/node-gdrive"]
