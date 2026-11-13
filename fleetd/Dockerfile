# Hugging Face Space (SDK: Docker). Set the secret FLEETD_TOKEN in the Space settings. The Space listens on 7860.
FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 git curl ca-certificates && rm -rf /var/lib/apt/lists/*
USER node
WORKDIR /home/node/app
COPY --chown=node fleetd.mjs .
ENV PORT=7860 HOST=0.0.0.0
EXPOSE 7860
CMD ["node", "fleetd.mjs"]
