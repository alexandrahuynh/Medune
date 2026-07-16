# Medune frontend — React + Vite dev server.
# docker-compose bind-mounts the source; Vite HMR uses filesystem polling
# (enabled via VITE_USE_POLLING) so changes propagate across the bind mount.
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# Run Vite directly bound to 0.0.0.0 so the published port is reachable.
# (Bypasses the package.json "dev" script, which hardcodes --host 127.0.0.1.)
CMD ["npx", "vite", "--host", "0.0.0.0"]
