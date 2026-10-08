# Запуск на сервере через Docker

Три контейнера: `backend` (FastAPI + планировщик парсеров), `web` (nginx:
статика фронта, прокси `/api`, basic-auth) и `caddy` (HTTPS: сам получает
и продлевает сертификат Let's Encrypt). Наружу открыт только `caddy`.

## Первый запуск

На сервере (Linux, установлен Docker с плагином compose —
`curl -fsSL https://get.docker.com | sh`):

```bash
git clone <адрес репозитория> pharmadash
cd pharmadash
cp .env.example .env
nano .env                      # задать DOMAIN и BASIC_AUTH_PASSWORD
docker compose up -d --build
```

Приложение откроется по адресу `https://<DOMAIN>/`, браузер спросит
логин и пароль из `.env`. Домен должен указывать на IP сервера, порты 80
и 443 должны быть открыты в файрволе: без них сертификат не выпустится.

## Перенос базы

База и загруженные xlsx лежат в `backend/data/` и в git не хранятся.
Без переноса приложение стартует с пустой базой — рынки можно заново
загрузить через админку.

Чтобы перенести текущие данные, на рабочей машине при остановленном
бэкенде слить WAL в основной файл и скопировать его:

```bash
python -c "import sqlite3; c = sqlite3.connect('backend/data/pharmdash.db'); c.execute('PRAGMA wal_checkpoint(TRUNCATE)'); c.close()"
scp backend/data/pharmdash.db user@server:pharmadash/backend/data/
scp -r backend/data/uploads user@server:pharmadash/backend/data/
```

На сервере перед копированием остановить бэкенд, после — запустить:

```bash
docker compose stop backend
# ... scp ...
docker compose start backend
```

## Обновление

```bash
git pull
docker compose up -d --build
```

Данные в `backend/data/` при пересборке сохраняются.

## Эксплуатация

```bash
docker compose ps              # состояние контейнеров
docker compose logs -f backend # логи API и парсеров
docker compose restart backend
docker compose down            # остановить всё (данные остаются)
```

Резервная копия базы без остановки сервиса:

```bash
docker compose exec backend python -c "import sqlite3; s = sqlite3.connect('/app/backend/data/pharmdash.db'); d = sqlite3.connect('/app/backend/data/backup.db'); s.backup(d); d.close(); s.close()"
```

## Настройки (`.env`)

| Переменная | Назначение | По умолчанию |
|---|---|---|
| `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD` | вход в приложение | обязательны |
| `DOMAIN` | доменное имя приложения | обязательна |
| `TZ` | часовой пояс; парсеры стартуют в 06:00 | `Europe/Moscow` |
| `EAPTEKA_REGION`, `OZERKI_REGION` | регионы парсеров | `spb`, `sankt-peterburg` |

После правки `.env`: `docker compose up -d`.

## Ограничения

- Бэкенд должен работать в одном экземпляре: планировщик парсеров живёт
  в памяти процесса API.
