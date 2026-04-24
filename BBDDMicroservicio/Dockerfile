ARG NODE_VERSION=24.13.0

FROM node:${NODE_VERSION}-alpine

ENV NODE_ENV production
WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --omit=dev

USER node
COPY . .

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3003/health/live', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD npm start
