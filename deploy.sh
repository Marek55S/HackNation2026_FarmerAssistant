#!/usr/bin/env bash
# Wdrożenie Hydrowise na Google Cloud Run (backend + frontend).
#
#   ./deploy.sh               oba serwisy
#   ./deploy.sh backend       tylko backend
#   ./deploy.sh frontend      tylko frontend (BACKEND_URL = adres już wdrożonego backendu)
#   ./deploy.sh --force ...   wdróż mimo niezacommitowanych zmian (tag obrazu dostaje sufiks -dirty)
#
# Wymaga: docker, gcloud zalogowany na konto z dostępem do projektu.
# Jednorazowa konfiguracja projektu (projekt, rejestr, sekrety CDSE) – patrz README, sekcja „Wdrożenie”.
set -euo pipefail

PROJECT=asystent-wodny-hn26
REGION=europe-central2
REPO="$REGION-docker.pkg.dev/$PROJECT/asystent"
BACKEND_SERVICE=asystent-backend
# Trwały cache backendu (pogoda Open‑Meteo, zdjęcia satelitarne, DEM, zlewnie…) – katalog .cache w kontenerze jest
# montowany z tego bucketu, więc dane pobrane raz zostają dla wszystkich instancji i kolejnych wdrożeń.
# Bez tego każda nowa instancja pobierała historię pogody od nowa i wyczerpywała darmowy limit Open‑Meteo (HTTP 429).
CACHE_BUCKET="$PROJECT-cache"
CACHE_DAYS=180   # starsze pliki cache są usuwane (i pobierane ponownie przy potrzebie) – koszt bucketu zostaje mały
FRONTEND_SERVICE=asystent-wodny

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

force=false
target=all
for arg in "$@"; do
  case "$arg" in
    --force) force=true ;;
    all | backend | frontend) target="$arg" ;;
    -h | --help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Nieznany argument: $arg (użyj: all | backend | frontend | --force)" >&2; exit 2 ;;
  esac
done

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\033[31mBłąd: %s\033[0m\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "brak dockera"
command -v gcloud >/dev/null || die "brak gcloud"

# 1. Stan repo – tag obrazu = commit, więc niezacommitowane zmiany by się w nim „ukryły”.
TAG="$(git rev-parse --short HEAD)"
if [[ -n "$(git status --porcelain)" ]]; then
  $force || die "masz niezacommitowane zmiany (git status). Zacommituj je albo uruchom z --force."
  TAG="$TAG-dirty-$(date +%Y%m%d%H%M%S)"
fi
log "Projekt $PROJECT · region $REGION · obraz :$TAG · cel: $target"

gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet >/dev/null 2>&1

built=()
cleanup() { [[ ${#built[@]} -gt 0 ]] && docker rmi "${built[@]}" >/dev/null 2>&1 || true; }
trap cleanup EXIT

url_of() { gcloud run services describe "$1" --project "$PROJECT" --region "$REGION" --format='value(status.url)'; }

check() { # check <nazwa> <url>
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 "$2")"
  [[ "$code" == 200 ]] || die "$1 nie odpowiada poprawnie ($2 → HTTP $code)"
  echo "$1 OK ($2)"
}

# Bucket na cache + prawo zapisu dla konta usługi backendu. Idempotentne: przy kolejnych wdrożeniach tylko sprawdza.
ensure_cache_bucket() {
  local sa number
  if ! gcloud storage buckets describe "gs://$CACHE_BUCKET" --project "$PROJECT" >/dev/null 2>&1; then
    log "Cache: tworzenie bucketu gs://$CACHE_BUCKET ($REGION, usuwanie plików po $CACHE_DAYS dniach)"
    gcloud storage buckets create "gs://$CACHE_BUCKET" --project "$PROJECT" --location "$REGION" \
      --uniform-bucket-level-access --public-access-prevention --quiet
    local rule
    rule="$(mktemp)"
    printf '{"rule":[{"action":{"type":"Delete"},"condition":{"age":%d}}]}' "$CACHE_DAYS" >"$rule"
    gcloud storage buckets update "gs://$CACHE_BUCKET" --lifecycle-file "$rule" --quiet
    rm -f "$rule"
  fi
  # Konto, na którym działa backend (domyślne konto Compute Engine, jeśli serwis nie ma własnego).
  sa="$(gcloud run services describe "$BACKEND_SERVICE" --project "$PROJECT" --region "$REGION" \
        --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || true)"
  if [[ -z "$sa" ]]; then
    number="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
    sa="$number-compute@developer.gserviceaccount.com"
  fi
  gcloud storage buckets add-iam-policy-binding "gs://$CACHE_BUCKET" --project "$PROJECT" \
    --member "serviceAccount:$sa" --role roles/storage.objectUser --quiet >/dev/null
}

deploy_backend() {
  local img="$REPO/backend:$TAG"
  ensure_cache_bucket
  log "Backend: budowanie $img"
  docker build --target run --build-context dane=dane -t "$img" backend
  built+=("$img")
  log "Backend: wysyłanie obrazu"
  docker push "$img"
  log "Backend: wdrażanie na Cloud Run ($BACKEND_SERVICE)"
  gcloud run deploy "$BACKEND_SERVICE" --project "$PROJECT" --region "$REGION" --image "$img" \
    --allow-unauthenticated --memory 2Gi --cpu 2 --timeout 300 --max-instances 3 \
    --set-secrets CDSE_CLIENT_ID=cdse-client-id:latest,CDSE_CLIENT_SECRET=cdse-client-secret:latest \
    --execution-environment gen2 \
    --add-volume "name=cache,type=cloud-storage,bucket=$CACHE_BUCKET,mount-options=uid=1000;gid=1000" \
    --add-volume-mount volume=cache,mount-path=/srv/backend/.cache \
    --quiet
}

deploy_frontend() {
  local img="$REPO/frontend:$TAG" backend_url
  backend_url="$(url_of "$BACKEND_SERVICE")"
  [[ -n "$backend_url" ]] || die "backend ($BACKEND_SERVICE) nie jest wdrożony – uruchom najpierw ./deploy.sh backend"
  log "Frontend: budowanie $img"
  docker build -t "$img" frontend
  built+=("$img")
  log "Frontend: wysyłanie obrazu"
  docker push "$img"
  log "Frontend: wdrażanie na Cloud Run ($FRONTEND_SERVICE), BACKEND_URL=$backend_url"
  gcloud run deploy "$FRONTEND_SERVICE" --project "$PROJECT" --region "$REGION" --image "$img" \
    --allow-unauthenticated --memory 512Mi --timeout 300 --max-instances 3 \
    --set-env-vars "BACKEND_URL=$backend_url" \
    --quiet
}

[[ "$target" == all || "$target" == backend ]] && deploy_backend
[[ "$target" == all || "$target" == frontend ]] && deploy_frontend

log "Sprawdzenie"
[[ "$target" == all || "$target" == backend ]] && check backend "$(url_of "$BACKEND_SERVICE")/api/health"
[[ "$target" == all || "$target" == frontend ]] && check frontend "$(url_of "$FRONTEND_SERVICE")/"

log "Gotowe: $(url_of "$FRONTEND_SERVICE")"
