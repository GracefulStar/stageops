FROM node:24-bookworm-slim AS frontend
WORKDIR /source
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend ./frontend
COPY components ./components
COPY hooks ./hooks
COPY lib ./lib
COPY app/globals.css ./app/globals.css
COPY vendor ./vendor
COPY public ./public
COPY backend/stageops/data ./backend/stageops/data
RUN npm run build:frontend

FROM python:3.12-slim-bookworm AS python
WORKDIR /app/backend
RUN pip install --no-cache-dir uv==0.12.8
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend ./
RUN uv sync --frozen --no-dev
COPY --from=frontend /source/frontend-dist /app/frontend-dist
RUN useradd --create-home --uid 10001 app
USER app
EXPOSE 8000
CMD [".venv/bin/uvicorn", "stageops.main:app", "--host", "0.0.0.0", "--port", "8000"]
