FROM node:18-alpine
WORKDIR /app
COPY index.html /index.html
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]