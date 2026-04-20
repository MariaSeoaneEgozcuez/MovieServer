ARG NODE_VERSION=24.13.0

FROM node:${NODE_VERSION}-alpine

ENV NODE_ENV production
WORKDIR /usr/src/app

RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

USER node
COPY . .

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3003/health/live', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD npm start
