FROM node:lts-alpine
WORKDIR /usr/app
COPY . .
RUN npm ci --omit=dev
ENV PORT=3000
EXPOSE $PORT
CMD [ "npm", "start" ]
