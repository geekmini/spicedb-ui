# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Enable corepack and prepare pnpm
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

# Set working directory
WORKDIR /app

# Copy lockfile and package.json for dependency installation
COPY package.json pnpm-lock.yaml ./

# Install dependencies using pnpm
RUN pnpm install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Build the Next.js application
RUN pnpm run build

# Expose the port Next.js runs on
EXPOSE 3000

# Run the Next.js application in production
CMD ["pnpm", "start"]
