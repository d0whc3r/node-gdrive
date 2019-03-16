FROM node:10-alpine as builder

COPY package.json yarn.lock tsconfig.json /app/
COPY webpack/ /app/webpack
COPY src/ /app/src
COPY cli/ /app/cli
WORKDIR /app
RUN yarn install && yarn build

FROM node:10-alpine

ENV TOKEN_FILE=/app/secrets/token.json
ENV CREDENTIALS_FILE=/app/secrets/credentials.json

COPY --from=builder /app/bin/cli.js /bin/gdrive.js
ENTRYPOINT ["node", "/bin/gdrive.js"]
