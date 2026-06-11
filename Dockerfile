# Minimal install test for dafke
# Verifies the CLI installs and runs correctly on a clean Linux system.
#
# Usage: docker build -t dafke-test . && docker run --rm dafke-test

FROM node:20-slim

# Install git (only hard runtime dependency not in base image)
RUN apt-get update && apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/*

# Configure git (needed for init wizard and DORA analyzer)
RUN git config --global user.email "test@dafke.be" && \
    git config --global user.name "CI Test"

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Initialize a test git repo
RUN git init && git add -A && git commit -m "init"

# Run the smoke test
CMD ["bash", "tests/e2e/smoke-test.sh"]
