# Medune backend — Node/Express medication search API.
# Dev-oriented image: docker-compose bind-mounts the source and `node --watch`
# restarts the server on change. Host/port/DB come from the environment.
FROM node:22-alpine

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Copy source. In docker-compose a bind mount overlays this for hot reload;
# the anonymous node_modules volume keeps the installed deps above.
COPY . .

EXPOSE 4000

# HOST=0.0.0.0 is supplied by compose so the port is reachable inside Docker.
CMD ["npm", "run", "dev"]
