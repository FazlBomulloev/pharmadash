# Контекст сборки — корень репозитория (см. docker-compose.yml):
# приложение импортируется как пакет `backend`.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# tzdata: планировщик парсеров стартует по локальному времени (переменная TZ)
RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt

COPY backend/ backend/

EXPOSE 8000

# Ровно один процесс uvicorn: планировщик и учёт запущенных парсеров
# живут в памяти процесса API, с несколькими воркерами они задвоятся.
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
