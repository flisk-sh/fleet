# Any Docker host. Set the secret FLEETD_TOKEN in the host's settings. It listens on 7860 on all interfaces.
FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 git curl ca-certificates && rm -rf /var/lib/apt/lists/*
USER node
WORKDIR /home/node/app
COPY --chown=node fleetd.mjs .
ENV PORT=7860 HOST=0.0.0.0
EXPOSE 7860
CMD ["node", "fleetd.mjs"]
