FROM node:22-alpine3.19
RUN apk --no-cache add --virtual builds-deps build-base python3 && apk add --no-cache libcap
RUN setcap cap_net_raw+ep $(which node)
RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
WORKDIR /home/node/app
COPY --chown=node:node package*.json ./
USER node
RUN npm install --production
COPY --chown=node:node . .
RUN npx prisma generate
EXPOSE 8000
ENTRYPOINT ["npm", "run", "prod"]