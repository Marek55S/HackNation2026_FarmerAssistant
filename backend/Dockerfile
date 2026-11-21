# Backend analizy (FastAPI). Dwa etapy:
#   dev – kod montowany z ./app, przeładowanie po zmianie (docker compose up dev)
#   run – obraz produkcyjny (Cloud Run: nasłuch na $PORT, domyślnie 8080)
# Układ jak w repo: /srv/backend (kod) + /srv/dane (progi IUNG czytane przez app/sources.py).
# Katalog dane/ przychodzi z dodatkowego kontekstu budowania "dane" (compose.yaml: additional_contexts),
# bez compose: docker build --build-context dane=../dane .
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /srv/backend
COPY requirements.txt .
RUN pip install -r requirements.txt \
 && useradd --create-home --uid 1000 app \
 && mkdir -p .cache && chown app:app .cache
COPY --from=dane . /srv/dane

FROM base AS dev
USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "app"]

FROM base AS run
COPY app ./app
USER app
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
