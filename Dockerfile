# Playwright's image ships Chromium + all OS deps for headless automation.
FROM mcr.microsoft.com/playwright:v1.49.0-jammy AS base
WORKDIR /app
ENV NODE_ENV=production

# Install dependencies (including dev deps needed for build + tsx worker).
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and generate the Prisma client + Next build.
COPY . .
RUN npx prisma generate && npm run build

EXPOSE 3000

# Default command runs the web server; docker-compose overrides for the worker.
CMD ["npm", "run", "start"]
