FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy all source files
COPY . .

# Install wrexer CLI globally and docker-cli
RUN apk update && apk add --no-cache docker-cli \
    && chmod +x cli/wrexer.js \
    && ln -sf /app/cli/wrexer.js /usr/local/bin/wrexer

# Create workspace directory (will be overridden by PVC at runtime)
RUN mkdir -p /workspace

EXPOSE 18789

CMD ["node", "server/index.js"]
