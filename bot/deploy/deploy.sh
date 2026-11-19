#!/usr/bin/env bash
# Runs the session recorder bot on a small virtual machine in Table Keep's
# Google Cloud project.
#
#   bot/deploy/deploy.sh setup     once: the machine, its disk, its identity and its secrets
#   bot/deploy/deploy.sh rules     once: only the secrets for answering rules questions
#   bot/deploy/deploy.sh deploy    each time: build the image and switch the machine to it
#   bot/deploy/deploy.sh status    is it running, and is it recording
#   bot/deploy/deploy.sh logs      what it has been saying
#
# `setup` reads the live bot's Discord token, the Deepgram key and the
# TypeSafe key from bot/.env.live.local, which is git-ignored and must never
# be committed; `rules` reads only the TypeSafe key:
#
#   DISCORD_BOT_TOKEN=...
#   DEEPGRAM_API_KEY=...
#   TYPESAFE_API_KEY=...
#
# The OpenAI key the bot answers rules questions with is the one the Cloud
# Functions write recaps with: the OPENAI_API_KEY secret Firebase keeps in this
# project. Both commands only let the bot read it.
#
# Everything here is safe to run twice.
set -euo pipefail

PROJECT="${TABLEKEEP_PROJECT:-homeboyshouse-dev}"
REGION=us-central1
ZONE=us-central1-a
VM=tablekeep-bot
DISK=tablekeep-bot-journal
ACCOUNT=tablekeep-bot
ACCOUNT_EMAIL="$ACCOUNT@$PROJECT.iam.gserviceaccount.com"
REGISTRY="$REGION-docker.pkg.dev/$PROJECT/tablekeep"
BUCKET="gs://$PROJECT.firebasestorage.app"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
ENV_FILE="$ROOT/bot/.env.live.local"
# The rules the image carries, and the Classic Fantasy rules' license, which goes wherever they do.
RULES_FILES=(docs/lubec/rules.md docs/rules/ose-classic/corpus.json docs/rules/ose-classic/OGL.txt)
gc() { gcloud --project "$PROJECT" --quiet "$@"; }

# Stores a secret from bot/.env.live.local and lets the bot read it.
store_secret() {
  local name="$1" value
  value="$(grep -E "^$name=" "$ENV_FILE" | head -1 | cut -d= -f2-)"
  [[ -n "$value" ]] || { echo "$name is missing from $ENV_FILE." >&2; exit 1; }
  gc secrets describe "$name" >/dev/null 2>&1 || gc secrets create "$name" --replication-policy automatic
  printf '%s' "$value" | gc secrets versions add "$name" --data-file=- >/dev/null
  gc secrets add-iam-policy-binding "$name" --member "serviceAccount:$ACCOUNT_EMAIL" --role roles/secretmanager.secretAccessor >/dev/null
}

# What answering rules questions needs: Jev's key, and the Functions' OpenAI key.
rules() {
  [[ -f "$ENV_FILE" ]] || { echo "Create $ENV_FILE with TYPESAFE_API_KEY first." >&2; exit 1; }
  store_secret TYPESAFE_API_KEY
  gc secrets describe OPENAI_API_KEY >/dev/null 2>&1 \
    || { echo "There is no OPENAI_API_KEY secret in $PROJECT. Set it for the Cloud Functions first: firebase functions:secrets:set OPENAI_API_KEY" >&2; exit 1; }
  gc secrets add-iam-policy-binding OPENAI_API_KEY --member "serviceAccount:$ACCOUNT_EMAIL" --role roles/secretmanager.secretAccessor >/dev/null
  echo "The bot can now answer rules questions. It reads its secrets when it starts: run bot/deploy/deploy.sh deploy."
}

# Whether any server is being recorded right now, asked of the database itself.
recording_now() {
  local token
  token="$(gcloud auth print-access-token)"
  curl -sf -X POST \
    -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    "https://firestore.googleapis.com/v1/projects/$PROJECT/databases/(default)/documents:runQuery" \
    -d '{"structuredQuery":{"from":[{"collectionId":"discordServers"}],"where":{"fieldFilter":{"field":{"fieldPath":"activeSession.sessionId"},"op":"GREATER_THAN","value":{"stringValue":""}}},"limit":1}}' \
    | grep -q '"document"'
}

setup() {
  [[ -f "$ENV_FILE" ]] || { echo "Create $ENV_FILE with DISCORD_BOT_TOKEN, DEEPGRAM_API_KEY and TYPESAFE_API_KEY first." >&2; exit 1; }

  gc services enable compute.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com logging.googleapis.com

  gc iam service-accounts describe "$ACCOUNT_EMAIL" >/dev/null 2>&1 \
    || gc iam service-accounts create "$ACCOUNT" --display-name 'Table Keep session recorder bot'
  # Only what the bot does: read and write the database, pull its own image, and write its logs.
  for role in roles/datastore.user roles/artifactregistry.reader roles/logging.logWriter; do
    gc projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$ACCOUNT_EMAIL" --role "$role" --condition=None >/dev/null
  done
  # Storage is granted on the one bucket, not across the project.
  gc storage buckets add-iam-policy-binding "$BUCKET" --member "serviceAccount:$ACCOUNT_EMAIL" --role roles/storage.objectAdmin >/dev/null

  store_secret DISCORD_BOT_TOKEN
  store_secret DEEPGRAM_API_KEY
  rules

  gc artifacts repositories describe tablekeep --location "$REGION" >/dev/null 2>&1 \
    || gc artifacts repositories create tablekeep --location "$REGION" --repository-format docker

  gc compute disks describe "$DISK" --zone "$ZONE" >/dev/null 2>&1 \
    || gc compute disks create "$DISK" --zone "$ZONE" --size 20GB --type pd-standard

  if ! gc compute instances describe "$VM" --zone "$ZONE" >/dev/null 2>&1; then
    gc compute instances create "$VM" --zone "$ZONE" \
      --machine-type e2-micro \
      --image-family cos-stable --image-project cos-cloud \
      --boot-disk-size 10GB --boot-disk-type pd-standard \
      --disk "name=$DISK,device-name=journal,mode=rw,auto-delete=no" \
      --service-account "$ACCOUNT_EMAIL" --scopes cloud-platform \
      --metadata-from-file "user-data=$HERE/cloud-init.yaml" \
      --metadata "bot-image=$REGISTRY/bot:none,google-logging-enabled=true" \
      --shielded-secure-boot
  fi
  echo "Set up. Now run: bot/deploy/deploy.sh deploy"
}

deploy() {
  # The rules are built into the image; without them the bot could not answer rules questions.
  local file
  for file in "${RULES_FILES[@]}"; do
    [[ -f "$ROOT/$file" ]] || { echo "There is no $file in this checkout. Deploy from a commit that has it." >&2; exit 1; }
  done
  if recording_now; then
    echo 'A session is being recorded right now. Deploying would interrupt it; try again when it has been stopped.' >&2
    exit 1
  fi
  local image
  image="$REGISTRY/bot:$(git -C "$ROOT" rev-parse --short HEAD)"
  (cd "$ROOT" && gc builds submit --config bot/deploy/cloudbuild.yaml --substitutions "_IMAGE=$image" .)
  gc compute instances add-metadata "$VM" --zone "$ZONE" --metadata "bot-image=$image"
  gc compute ssh "$VM" --zone "$ZONE" --command 'sudo systemctl restart tablekeep-bot && sleep 20 && sudo systemctl is-active tablekeep-bot && sudo docker logs --tail 5 tablekeep-bot'
  echo "Deployed $image"
}

status() {
  gc compute instances describe "$VM" --zone "$ZONE" --format 'value(status,metadata.items.bot-image)'
  if recording_now; then echo 'Recording a session now.'; else echo 'Not recording.'; fi
}

logs() {
  gc logging read "resource.type=gce_instance AND jsonPayload.container.name=/tablekeep-bot" --limit "${1:-50}" --format 'value(jsonPayload.message)' --freshness 1d
}

case "${1:-}" in
  setup) setup ;;
  rules) rules ;;
  deploy) deploy ;;
  status) status ;;
  logs) shift; logs "$@" ;;
  *) sed -n '2,27p' "$0"; exit 1 ;;
esac
