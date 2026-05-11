
FROM node:18-alpine
WORKDIR /app
# Remove the index.html copy for now to fix the build
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]