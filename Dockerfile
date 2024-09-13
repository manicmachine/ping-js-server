FROM node:22-bookworm
RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
WORKDIR /home/node/app
COPY --chown=node:node package*.json ./
USER node
RUN npm install --production
COPY --chown=node:node . .
EXPOSE 8000
ENTRYPOINT ["npm", "run", "prod"]