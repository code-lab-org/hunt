FROM node:lts-alpine
ENV NODE_ENV=production
WORKDIR /usr/app
# install dependencies first so code changes reuse the cached layer
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
# run without root privileges; the app only reads its files
USER node
ENV PORT=3000
EXPOSE $PORT
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s \
  CMD wget -qO /dev/null "http://localhost:$PORT/" || exit 1
CMD [ "node", "bin/www" ]
