**🏗 SCB Portal Enterprise Platform: Technical Reference**

**Версия:** 1.0 (Январь 2026)  
**Статус:** Production / Active Development  
**Тип:** Self-Hosted Microservices Infrastructure

**1\. Архитектура и Принципы**

Система построена по микросервисной архитектуре с жесткой изоляцией баз данных. В основе лежит принцип **"Database-per-Service"**, где каждый сервис имеет свое собственное хранилище, недоступное напрямую другим контейнерам, кроме как через API или внутреннюю Docker-сеть.

**Ключевые правила безопасности**

1.  **Нулевое доверие к сети:** Все базы данных и служебные интерфейсы (Kong, Pipelines) биндятся строго на 127.0.0.1.
2.  **Единая точка входа:** Весь внешний трафик проходит через **Nginx** (Reverse Proxy), который терминирует SSL.
3.  **Изоляция данных:**
    - БД Supabase (db) доступна n8n и Metabase только внутри Docker-сети.
    - Внешний доступ к БД возможен **только** через SSH-туннель.
4.  **Защита админки:** Supabase Studio закрыта дополнительной Basic Auth на уровне Nginx.

**2\. Карта сервисов и доменов**

|     |     |     |     |
| --- | --- | --- | --- |
| Сервис | URL (Public) | Внутренний хост:порт | Описание |
| **OpenWebUI** | https://portal.tr1one23.beget.tech | 127.0.0.1:3002 | Основной интерфейс (AI Chat). |
| **n8n** | https://n8n.tr1one23.beget.tech | 127.0.0.1:5678 | Автоматизация и ETL пайплайны. |
| **Metabase** | https://metabase.tr1one23.beget.tech | 127.0.0.1:3001 | BI аналитика и дашборды. |
| **Supabase Studio** | https://supabase.tr1one23.beget.tech | 127.0.0.1:3000 | Админка БД (Postgres UI). |
| **Supabase API** | _Нет (Internal only)_ | kong:8000 | API шлюз для работы с БД. |

**3\. Конфигурация инфраструктуры (Infrastructure as Code)**

**3.1. Docker Compose**

Файл: docker-compose.yml  
_Запускает основные сервисы. Переменные окружения ${...} берутся из .env._

version: '3.8'  
<br/>services:  
\# ==========================================  
\# 1. CORE DATA LAYER (Supabase)  
\# ==========================================  
db:  
image: supabase/postgres:15.1.1.78  
container_name: supabase-db  
restart: unless-stopped  
ports:  
\- "127.0.0.1:5432:5432" # Localhost only  
environment:  
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}  
POSTGRES_DB: ${POSTGRES_DB}  
volumes:  
\- ./data/db:/var/lib/postgresql/data  
healthcheck:  
test: \["CMD", "pg_isready", "-U", "postgres"\]  
interval: 10s  
timeout: 5s  
retries: 5  
<br/>meta:  
image: supabase/postgres-meta:v0.84.2  
container_name: supabase-meta  
restart: unless-stopped  
environment:  
PG_META_PORT: 8080  
PG_META_DB_HOST: db  
PG_META_DB_PASSWORD: ${POSTGRES_PASSWORD}  
depends_on:  
db:  
condition: service_healthy  
<br/>studio:  
image: supabase/studio:latest  
container_name: supabase-studio  
restart: unless-stopped  
ports:  
\- "127.0.0.1:3000:3000" # Localhost only  
environment:  
STUDIO_PG_META_URL: http://meta:8080  
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}  
SUPABASE_URL: http://kong:8000  
SUPABASE_PUBLIC_URL: http://localhost:8000  
SUPABASE_ANON_KEY: ${ANON_KEY}  
SUPABASE_SERVICE_KEY: ${SERVICE_ROLE_KEY}  
<br/>auth:  
image: supabase/gotrue:v2.178.0  
container_name: supabase-auth  
restart: unless-stopped  
ports:  
\- "127.0.0.1:9999:9999" # Localhost only  
environment:  
GOTRUE_API_HOST: 0.0.0.0  
GOTRUE_API_PORT: 9999  
API_EXTERNAL_URL: http://localhost:8000  
GOTRUE_DB_DRIVER: postgres  
GOTRUE_DB_DATABASE_URL: postgres://postgres:${POSTGRES_PASSWORD}@db:5432/postgres?search_path=auth  
GOTRUE_SITE_URL: http://localhost:3000  
GOTRUE_JWT_SECRET: ${JWT_SECRET}  
GOTRUE_JWT_EXP: 3600  
<br/>rest:  
image: postgrest/postgrest:v12.0.2  
container_name: supabase-rest  
restart: unless-stopped  
environment:  
PGRST_DB_URI: postgres://postgres:${POSTGRES_PASSWORD}@db:5432/postgres  
PGRST_DB_SCHEMAS: public,storage,graphql_public  
PGRST_DB_ANON_ROLE: anon  
PGRST_JWT_SECRET: ${JWT_SECRET}  
PGRST_DB_PRE_CONFIG: postgrest.pre_config  
depends_on:  
db:  
condition: service_healthy  
<br/>kong:  
image: kong:2.8-alpine  
container_name: supabase-kong  
restart: unless-stopped  
ports:  
\- "127.0.0.1:8000:8000" # Internal API Gateway  
\- "127.0.0.1:8443:8443"  
environment:  
KONG_DATABASE: "off"  
KONG_DECLARATIVE_CONFIG: /usr/local/kong/kong.yml  
volumes:  
\- ./kong.yml:/usr/local/kong/kong.yml:ro  
<br/>\# ==========================================  
\# 2. SERVICE DATABASES  
\# ==========================================  
n8n-db:  
image: postgres:16-alpine  
container_name: n8n-db  
restart: unless-stopped  
environment:  
POSTGRES_USER: n8n  
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}  
POSTGRES_DB: n8n  
volumes:  
\- ./data/n8n-db:/var/lib/postgresql/data  
ports:  
\- "127.0.0.1:5433:5432"  
<br/>metabase-db:  
image: postgres:16-alpine  
container_name: metabase-db  
restart: unless-stopped  
environment:  
POSTGRES_USER: metabase  
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}  
POSTGRES_DB: metabase  
volumes:  
\- ./data/metabase-db:/var/lib/postgresql/data  
ports:  
\- "127.0.0.1:5434:5432"  
<br/>openwebui-db:  
image: pgvector/pgvector:pg16  
container_name: openwebui-db  
restart: unless-stopped  
environment:  
POSTGRES_USER: openwebui  
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}  
POSTGRES_DB: openwebui  
volumes:  
\- ./data/openwebui-db:/var/lib/postgresql/data  
ports:  
\- "127.0.0.1:5435:5432"  
<br/>\# ==========================================  
\# 3. APPLICATIONS  
\# ==========================================  
n8n:  
image: n8nio/n8n:latest  
container_name: n8n  
restart: unless-stopped  
ports:  
\- "127.0.0.1:5678:5678"  
environment:  
\- N8N_HOST=n8n.tr1one23.beget.tech  
\- N8N_PORT=5678  
\- N8N_PROTOCOL=https  
\- WEBHOOK_URL=https://n8n.tr1one23.beget.tech/  
\- DB_TYPE=postgresdb  
\- DB_POSTGRESDB_HOST=n8n-db  
\- DB_POSTGRESDB_DATABASE=n8n  
\- DB_POSTGRESDB_USER=n8n  
\- DB_POSTGRESDB_PASSWORD=${POSTGRES_PASSWORD}  
<br/>metabase:  
image: metabase/metabase:latest  
container_name: metabase  
restart: unless-stopped  
ports:  
\- "127.0.0.1:3001:3000"  
environment:  
MB_DB_TYPE: postgres  
MB_DB_CONNECTION_URI: "jdbc:postgresql://metabase-db:5432/metabase?user=metabase&password=${POSTGRES_PASSWORD}"  
<br/>pipelines:  
image: ghcr.io/open-webui/pipelines:main  
container_name: pipelines  
restart: unless-stopped  
volumes:  
\- ./data/pipelines:/app/pipelines  
environment:  
\- PIPELINES_API_KEY=0p3n-w3bu!  
<br/>openwebui:  
\# PROD BUILD  
build:  
context: ./custom-openwebui  
dockerfile: Dockerfile  
args:  
OLLAMA_BASE_URL: '/ollama'  
image: custom-openwebui:prod  
container_name: openwebui  
restart: unless-stopped  
ports:  
\- "127.0.0.1:3002:8080"  
environment:  
\- DATABASE_URL=postgres://openwebui:${POSTGRES_PASSWORD}@openwebui-db:5432/openwebui  
\- VECTOR_DB=pgvector  
\- WEBUI_URL=https://portal.tr1one23.beget.tech  
\- METABASE_SITE_URL=https://metabase.tr1one23.beget.tech  
\- METABASE_SECRET_KEY=96c55c0c7236a866c5e88f6424acabdbe256fccbeaaec905318dd307fd43b179  
volumes:  
\- ./data/openwebui:/app/backend/data  
extra_hosts:  
\- "host.docker.internal:host-gateway"  
<br/>\# DEV BUILD (Test Environment)  
openwebui-test:  
build:  
context: ./custom-openwebui  
dockerfile: Dockerfile  
args:  
OLLAMA_BASE_URL: '/ollama'  
image: custom-openwebui:test  
container_name: openwebui-test  
restart: no  
ports:  
\- "0.0.0.0:3005:8080" # Exposed for Dev Frontend  
environment:  
\- WEBUI_SECRET_KEY=t0p_s3cr3t_key_for_testing_only  
volumes:  
\- ./data-test:/app/backend/data  
extra_hosts:  
\- "host.docker.internal:host-gateway"  

**3.2. Kong Gateway**

Файл: kong.yml  
_Определяет маршрутизацию внутренних сервисов Supabase._

\_format_version: "2.1"  
services:  
\- name: rest  
url: http://rest:3000  
routes:  
\- name: rest-route  
paths:  
\- /rest/v1/  
strip_path: true  
\- name: auth-service  
url: http://auth:9999  
routes:  
\- name: auth-route  
paths:  
\- /auth/v1  
strip_path: true  
\- name: meta-service  
url: http://meta:8080  
routes:  
\- name: meta-route  
paths:  
\- /pg  
strip_path: true  

**3.3. Nginx Reverse Proxy**

Файлы в /etc/nginx/sites-available/. Везде настроен SSL (Certbot) и редирект с HTTP на HTTPS.

**1\. Portal (OpenWebUI)**

server {  
server_name portal.tr1one23.beget.tech;  
location / {  
proxy_pass http://127.0.0.1:3002;  
proxy_http_version 1.1;  
proxy_set_header Upgrade $http_upgrade;  
proxy_set_header Connection "upgrade";  
\# ...стандартные заголовки и увеличенные таймауты (600s)...  
}  
}  

**2\. Supabase Studio (Admin)**  
_Особенность: защищен паролем (Basic Auth)._

server {  
server_name supabase.tr1one23.beget.tech;  
location / {  
auth_basic "Restricted Area";  
auth_basic_user_file /etc/nginx/.htpasswd;  
proxy_pass http://127.0.0.1:3000;  
\# ...заголовки...  
}  
}  

**3\. n8n**  
_Особенность: proxy_buffering off и client_max_body_size 50M._

**4\. Metabase**  
_Проксирует на 127.0.0.1:3001._

**4\. Базы данных и Инициализация**

**4.1. Доступ для администрирования**

Доступ к базам только через **SSH Tunnel**:

- **Host:** IP сервера
- **User:** root
- **Target Host:** localhost (не внешний IP!)
- **Target Ports:**
    - 5432: Supabase (Main)
    - 5433: n8n
    - 5434: Metabase
    - 5435: OpenWebUI

**4.2. Инициализация Supabase (SQL)**

Эти SQL команды должны быть выполнены в базе db (Supabase) для корректной работы API и схем.

\-- 1. Схема для PostgREST  
CREATE SCHEMA IF NOT EXISTS postgrest;  
<br/>\-- 2. Функция авто-обнаружения схем  
CREATE OR REPLACE FUNCTION postgrest.pre_config()  
RETURNS void AS $$  
SELECT set_config('pgrst.db_schemas', string_agg(nspname, ','), true)  
FROM pg_namespace  
WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast', 'postgrest')  
AND nspname NOT LIKE 'pg_%'  
AND nspname NOT LIKE '\_pg_%';  
$$ LANGUAGE sql SECURITY DEFINER;  
<br/>\-- 3. Пользовательские схемы  
CREATE SCHEMA IF NOT EXISTS td_group;  

**5\. Кастомизация OpenWebUI (Dev Guide)**

В проекте используется кастомная сборка OpenWebUI.  
**Путь к исходникам:** ./opt/portal/custom-openwebui/

**Внесенные изменения:**

1.  **Backend (Python):**
    - **Файл:** backend/open_webui/routers/metabase.py
    - **Суть:** Добавлен эндпоинт/сервер для безопасного вывода отчетов Metabase через iframe (подпись токенов).
2.  **Frontend (Svelte):**
    - **Сайдбар:** src/lib/components/layout/Sidebar.svelte
        - Добавлены ссылки на внешние сервисы (Supabase, Metabase, n8n) для админов.
    - **Раздел Ассистенты:** src/routes/(app)/assistants
        - Новый раздел для выбора и управления AI-агентами.
    - **Раздел Отчеты:** src/routes/(app)/reports
        - Интеграция дашбордов Metabase.

**5\. Интеграция n8n через Pipelines**

OpenWebUI использует сервис pipelines для подключения внешних логик (n8n, LangChain и др.) как обычных моделей чата.

**5.1. Установка скрипта**

1.  Создать Python-файл в папке ./data/pipelines (например, n8n_connector.py).
2.  Вставить код (см. ниже).
3.  Перезагрузить контейнер pipelines: docker compose restart pipelines.
4.  В админке OpenWebUI (Admin Panel -> Settings -> Connections) убедиться, что Pipelines подключен (http://pipelines:9099).

**5.2. Код коннектора (Шаблон) (Python)**

Этот скрипт регистрирует n8n-workflow как модель. Настройки URL и токенов задаются через UI (Valves).

"""  
title: n8n Workflow Connector  
author: Shaitan-Machine Team  
date: 2026-01-19  
version: 1.2  
license: MIT  
description: Connects n8n workflow as a selectable model in Open WebUI.  
requirements: requests, pydantic  
"""  
<br/>from typing import List, Union, Generator, Iterator  
from pydantic import BaseModel, Field  
import requests  
import json  
import time  
<br/>class Pipeline:  
\# Настройки (Valves) - доступны в Admin Panel -> Pipelines -> Valves  
class Valves(BaseModel):  
\# 1. Основные настройки подключения  
N8N_WEBHOOK_URL: str = Field(  
default="https://n8n.tr1one23.beget.tech/webhook/slug",  
description="Полный URL вашего Production Webhook из n8n"  
)  
N8N_BEARER_TOKEN: str = Field(  
default="",  
description="Если в n8n настроена Header Auth, введите токен здесь"  
)  
N8N_TIMEOUT: int = Field(  
default=60,  
description="Таймаут ожидания ответа от n8n (в секундах)"  
)  
<br/>\# 2. Настройки отображения  
MODEL_ID: str = Field(  
default="n8n_bot",  
description="ID модели в системе (только латиница, без пробелов)"  
)  
MODEL_NAME: str = Field(  
default="N8N Assistant",  
description="Имя, которое будет видно в списке моделей"  
)  
<br/>\# 3. Настройки данных  
SEND_FULL_HISTORY: bool = Field(  
default=False,  
description="Отправлять всю историю (True) или только последнее сообщение (False)"  
)  
<br/>def \__init_\_(self):  
\# В Docker Pipelines type "manifold" обязателен  
self.type = "manifold"  
self.id = "n8n_generic_connector"  
self.name = "N8N Connector Base"  
self.valves = self.Valves()  
<br/>async def on_startup(self):  
print(f"✅ {self.id} started. Target: {self.valves.MODEL_NAME}")  
<br/>async def on_shutdown(self):  
print(f"🛑 {self.id} stopped.")  
<br/>async def on_valves_updated(self):  
print(f"🔄 Valves updated. URL: {self.valves.N8N_WEBHOOK_URL}")  
<br/>def pipelines(self) -> List\[dict\]:  
"""Регистрирует модель с именем из Valves"""  
return \[  
{  
"id": self.valves.MODEL_ID,  
"name": self.valves.MODEL_NAME  
}  
\]  
<br/>def pipe(  
self, user_message: str, model_id: str, messages: List\[dict\], body: dict  
) -> Union\[str, Generator, Iterator\]:  
<br/>print(f"🚀 Sending to n8n: {model_id}")  
<br/>\# 1. Подготовка заголовков  
headers = {"Content-Type": "application/json"}  
if self.valves.N8N_BEARER_TOKEN:  
headers\["Authorization"\] = f"Bearer {self.valves.N8N_BEARER_TOKEN}"  
<br/>\# 2. Извлечение данных пользователя  
user_data = body.get("user", {})  
username = user_data.get("name", "") or user_data.get("email", "").split("@")\[^0\]  
<br/>\# 3. Подготовка данных (Payload)  
payload = {  
"model": model_id,  
"message": user_message,  
"username": username,  
"user": user_data,  
"chat_id": body.get("chat_id", ""),  
"timestamp": time.time()  
}  
<br/>if self.valves.SEND_FULL_HISTORY:  
payload\["messages"\] = messages  
<br/>\# 4. Отправка запроса  
try:  
response = requests.post(  
self.valves.N8N_WEBHOOK_URL,  
json=payload,  
headers=headers,  
timeout=self.valves.N8N_TIMEOUT  
)  
response.raise_for_status()  
<br/>\# 5. Обработка ответа  
try:  
result = response.json()  
\# Поиск поля с ответом (адаптивность под разные ноды n8n)  
content = (  
result.get("response") or  
result.get("output") or  
result.get("text") or  
result.get("content")  
)  
<br/>if content:  
return str(content)  
<br/>return json.dumps(result, ensure_ascii=False, indent=2)  
<br/>except json.JSONDecodeError:  
return response.text  
<br/>except requests.exceptions.Timeout:  
return f"⏱️ Ошибка: n8n не ответил за {self.valves.N8N_TIMEOUT} секунд."  
except requests.exceptions.ConnectionError:  
return f"🔌 Ошибка: Не удалось подключиться к n8n."  
except Exception as e:  
return f"❌ Ошибка Pipeline: {str(e)}"  

**6\. Управление моделями и Ассистентами**

**6.1. Добавление в раздел "Ассистенты"**

В кастомной версии OpenWebUI реализован отдельный раздел /assistants.  
Чтобы модель (в том числе созданная через Pipelines/n8n) появилась в этом разделе:

1.  Перейти в **Workspace -> Models**.
2.  Выбрать нужную модель -> **Edit**.
3.  Развернуть секцию **System Prompt / Tags**.
4.  Добавить тег: assistant.
5.  Сохранить. Модель появится в сетке ассистентов.

**Процесс деплоя изменений**

1.  Внести правки в код в папке custom-openwebui.
2.  Пересобрать и перезапустить контейнер:

docker compose build openwebui  
docker compose up -d openwebui  

1.  Для тестов использовать openwebui-test (порт 3005).

**7\. Roadmap & Backlog (План работ)**

**Ближайшие исправления (Bugs)**

- \[ \] **Images Chunking:** Исправить ошибки при обработке изображений в чате (проблема с нарезкой/токенизацией).

**Развитие Pipelines & n8n**

- \[ \] **Unified "Easy" Pipeline:** Создать универсальный скрипт для быстрого добавления простых моделей.
    - _Механизм:_ Авто-обнаружение по тегам model, easy в n8n.
- \[ \] **"Hard" Pipeline Template:** Шаблон для сложных сценариев с валидацией данных на стороне Python перед отправкой.
    - _Теги:_ model, hard.

**Интеграция Metabase**

- \[ \] **Auto-Sync:** Реализовать автоматическое подтягивание списка дашбордов из Metabase в раздел "Отчеты" OpenWebUI.
    - Включая мета-информацию (название, описание, ID).

**Расширение инфраструктуры (New Containers)**

Планируется внедрение новых сервисов в docker-compose:

- \[ \] **Open Notebook:** (https://www.open-notebook.ai/).
- \[ \] **ComfyUI:** Генерация изображений и видео.
- \[ \] **Ollama:** Локальный запуск LLM (если потребуется offload с API провайдеров; QWEN для Open Notebook и эмбендингов).

**8\. Важные вопросы (Keep in Mind)**

**🔴 Backup Strategy**

- Требуется настроить регулярный бэкап данных.
- **Что бэкапить:** Папки ./data/\* (Supabase, n8n, OpenWebUI).
- **Инструмент:** Cron job + скрипт архивации (tar.gz) + выгрузка на внешнее S3 хранилище.

**🟡 Update Strategy**

- Обновление системы не должно затирать кастомные настройки.
- **Подход:** Использовать Git.
    - main ветка: Стабильная конфигурация.
    - custom-openwebui: Отдельный репозиторий или submodule.
    - При обновлении docker-compose.yml делать diff изменений вручную.

**🟢 Dev Environment**

- Поддерживать отдельную версию системы (openwebui-test порт 3005) для тестирования UI-правок и дополнение перед деплоем в прод.

_Важно:_ Dev-версия не должна иметь доступ к продовой базе Supabase, если только это не осознанный выбор (сейчас настроена изоляция).