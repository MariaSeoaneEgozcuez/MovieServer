FROM node:24.13.0-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

EXPOSE 3005

CMD ["npm", "start"]