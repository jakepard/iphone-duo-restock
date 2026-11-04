FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY lib ./lib
COPY worker ./worker
CMD ["node","worker/worker.js"]
