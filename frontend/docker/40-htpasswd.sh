#!/bin/sh
# Собирает файл паролей для basic-auth из переменных окружения.
# Запускается штатным entrypoint образа nginx до старта сервера.
set -eu

if [ -z "${BASIC_AUTH_USER:-}" ] || [ -z "${BASIC_AUTH_PASSWORD:-}" ]; then
    echo "40-htpasswd.sh: задайте BASIC_AUTH_USER и BASIC_AUTH_PASSWORD в .env" >&2
    exit 1
fi

hash=$(printf '%s' "$BASIC_AUTH_PASSWORD" | openssl passwd -apr1 -stdin)
printf '%s:%s\n' "$BASIC_AUTH_USER" "$hash" > /etc/nginx/.htpasswd
chown nginx:nginx /etc/nginx/.htpasswd
chmod 640 /etc/nginx/.htpasswd
