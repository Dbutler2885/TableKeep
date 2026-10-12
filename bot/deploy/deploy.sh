#!/usr/bin/env bash
# Runs the session recorder bot on a small virtual machine in Table Keep's
# Google Cloud project.
#
#   bot/deploy/deploy.sh setup     once: the machine, its disk, its identity and its secrets
#   bot/deploy/deploy.sh deploy    each time: build the image and switch the machine to it
#   bot/deploy/deploy.sh status    is it running, and is it recording
#   bot/deploy/deploy.sh logs      what it has been saying
#
# `setup` reads the live bot's Discord token and the Deepgram key from
# bot/.env.live.local, which is git-ignored and must never be committed:
#
#   DISCORD_BOT_TOKEN=...
#   DEEPGRAM_API_KEY=...
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
gc() { gcloud --project "$PROJECT" --quiet "$@"; }

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
  local env_file="$ROOT/bot/.env.live.local"
  [[ -f "$env_file" ]] || { echo "Create $env_file with DISCORD_BOT_TOKEN and DEEPGRAM_API_KEY first." >&2; exit 1; }

  gc services enable compute.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com logging.googleapis.com

  gc iam service-accounts describe "$ACCOUNT_EMAIL" >/dev/null 2>&1 \
    || gc iam service-accounts create "$ACCOUNT" --display-name 'Table Keep session recorder bot'
  # Only what the bot does: read and write the database, pull its own image, and write its logs.
  for role in roles/datastore.user roles/artifactregistry.reader roles/logging.logWriter; do
    gc projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$ACCOUNT_EMAIL" --role "$role" --condition=None >/dev/null
  done
  # Storage is granted on the one bucket, not across the project.
  gc storage buckets add-iam-policy-binding "$BUCKET" --member "serviceAccount:$ACCOUNT_EMAIL" --role roles/storage.objectAdmin >/dev/null

  for name in DISCORD_BOT_TOKEN DEEPGRAM_API_KEY; do
    local value
    value="$(grep -E "^$name=" "$env_file" | head -1 | cut -d= -f2-)"
    [[ -n "$value" ]] || { echo "$name is missing from $env_file." >&2; exit 1; }
    gc secrets describe "$name" >/dev/null 2>&1 || gc secrets create "$name" --replication-policy automatic
    printf '%s' "$value" | gc secrets versions add "$name" --data-file=- >/dev/null
    gc secrets add-iam-policy-binding "$name" --member "serviceAccount:$ACCOUNT_EMAIL" --role roles/secretmanager.secretAccessor >/dev/null
  done

  gc artifacts repositories describe tablekeep --location "$REGION" >/dev/null 2>&1 \
    || gc artifacts repositories create tablekeep --location "$REGION" --repository-format docker

  gc compute disks describe "$DISK" --zone "$ZONE" >/dev/null 2>&1 \
    || gc compute disks create "$DISK" --zone "$ZONE" --size 20GB --type pd-balanced

  if ! gc compute instances describe "$VM" --zone "$ZONE" >/dev/null 2>&1; then
    gc compute instances create "$VM" --zone "$ZONE" \
      --machine-type e2-small \
      --image-family cos-stable --image-project cos-cloud \
      --boot-disk-size 10GB \
      --disk "name=$DISK,device-name=journal,mode=rw,auto-delete=no" \
      --service-account "$ACCOUNT_EMAIL" --scopes cloud-platform \
      --metadata-from-file "user-data=$HERE/cloud-init.yaml" \
      --metadata "bot-image=$REGISTRY/bot:none,google-logging-enabled=true" \
      --shielded-secure-boot
  fi
  echo "Set up. Now run: bot/deploy/deploy.sh deploy"
}

deploy() {
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
  deploy) deploy ;;
  status) status ;;
  logs) shift; logs "$@" ;;
  *) sed -n '2,18p' "$0"; exit 1 ;;
esac
