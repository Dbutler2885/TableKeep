# The session recorder bot.
#
# Built from the repository root, because the bot shares its Firestore paths
# with the functions:
#
#   docker build -f bot/Dockerfile -t tablekeep-bot .
#
# Node 24 runs the TypeScript as it is, so there is no build step.
FROM node:24-slim

ENV NODE_ENV=production
WORKDIR /app/bot

# The voice libraries are native. They ship prebuilt for this platform; the
# compiler is only there in case one of them has to be built after all.
COPY bot/package.json bot/package-lock.json ./
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git python3 make g++ \
  && npm ci --omit=dev \
  && apt-get purge -y git python3 make g++ \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/* /root/.npm

COPY bot/src ./src
COPY bot/assets ./assets
COPY functions/src/firestorePaths.ts /app/functions/src/firestorePaths.ts

# The journal lives on a disk that outlives the container.
ENV JOURNAL_DIR=/data/journals
VOLUME /data

USER node
CMD ["node", "src/main.ts"]
