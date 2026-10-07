FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
RUN mkdir -p /app/runtime
ENV PORT=6000
EXPOSE 6000
CMD ["npm","start"]
