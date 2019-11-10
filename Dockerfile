FROM node:10 AS builder

COPY package.json yarn.lock tsconfig.json rollup.config.js /app/
WORKDIR /app

RUN yarn install
COPY src/ /app/src
COPY cli/ /app/cli
RUN yarn build

FROM node:10

ENV TOKEN_FILE=/app/secrets/token.json
ENV CREDENTIALS_FILE=/app/secrets/credentials.json

COPY --from=builder /app/bin/cli.js /bin/gdrive.js
ENTRYPOINT ["node", "/bin/gdrive.js"]
