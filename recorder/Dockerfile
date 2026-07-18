# Build from the REPO ROOT so the file:../shared dependency is in context:
#   docker build -f recorder/Dockerfile -t prezik-recorder .
# The Playwright image pins the browser build that matches playwright 1.61.1.
FROM mcr.microsoft.com/playwright:v1.61.1-noble

# System ffmpeg/ffprobe for muxing narration and probing durations.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# recorder is @prezik/recorder (file:../shared -> @prezik/shared), so lay them out
# side by side: /app is recorder, /shared is shared (../shared from /app).
WORKDIR /app

# Shared source plus its own zod, so the tsconfig-paths import of zod resolves.
COPY shared/package.json /shared/package.json
COPY shared/src/ /shared/src/
RUN cd /shared && npm install --no-save zod@4.4.3

# Recorder dependencies from the lockfile (installs @prezik/shared as file:../shared).
COPY recorder/package.json recorder/package-lock.json /app/
RUN npm ci

# Recorder source (only what runs; no host node_modules/tmp/logs).
COPY recorder/tsconfig.json /app/tsconfig.json
COPY recorder/src/ /app/src/
COPY recorder/fixtures/ /app/fixtures/

ENV PORT=8080 \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe
EXPOSE 8080
CMD ["npm", "run", "start"]
