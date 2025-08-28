# @kdinisv/nosqli

Лёгкий сканер NoSQL-инъекций с CLI и библиотекой, вдохновлённый NoSQLMap, с интерфейсом наподобие sql-scanner.

## Возможности

- Тестирование GET-параметров строковыми полезными нагрузками (MongoDB-ориентированные).
- Тестирование JSON-тела (POST/PUT/PATCH) вставкой операторов ($ne, $regex, $in и т.д.).
- Простая эвристика: дифф статуса/размера ответа и поисковые ключевые слова ошибок MongoDB.
- CLI и программный API.
- Надёжный HTTP-драйвер: retry с экспоненциальным backoff (p50/p95 метрики), таймауты, поддержка прокси и NO_PROXY.
- JSONL-лог попыток HTTP (причины ретраев, коды/ошибки) и краткая метрика задержек/ошибок.

## Установка

```
npm install -g
```

или как зависимость проекта

```
npm install @kdinisv/nosqli
```

## Использование CLI

```
nosqli-scan https://example.com/search?user=1 -g user
nosqli-scan https://example.com/login -X POST -f username,password -d '{"username":"a","password":"b"}'
```

Дополнительно (HTTP надёжность/логирование):

```
# Retry/timeout/proxy
nosqli-scan https://example.com/api?q=a -g q \
  --retry-max 3 --retry-base-delay 200 --retry-max-delay 2000 \
  --timeout 8000 --proxy http://127.0.0.1:8080

# JSONL-лог попыток и метрики
nosqli-scan https://example.com/api?q=a -g q --http-jsonl http.log.jsonl
```

Переменные окружения: HTTP_PROXY/HTTPS_PROXY/NO_PROXY учитываются, флаг `--proxy` имеет приоритет.

## Программный API

```js
import { Scanner } from "@kdinisv/nosqli";
const scanner = new Scanner({ timeoutMs: 8000, delayMs: 50 });

// GET
const getFindings = await scanner.scanGet("https://example.com/search?q=test", [
  "q",
]);

// Body
const bodyFindings = await scanner.scanBody(
  "https://example.com/login",
  "POST",
  { username: "a", password: "b" },
  ["username", "password"]
);
```

### Логи и метрики HTTP

- Флаг `--http-jsonl` пишет строки формата JSON: `{ ts, url, method, attempt, statusCode|errorCode, durationMs, willRetry, retryDelayMs, reason }`.
- В конце выполнения печатается сводка: кол-во попыток/ретраев/ошибок и latencies p50/p95/max.

## Ограничения и заметки

- Инструмент проводит пассивно-активные проверки, ориентированные на MongoDB. Он не эксплуатирует уязвимость, а только ищет индикаторы.
- Для других движков NoSQL потребуется расширить пэйлоады.
- Для точности результатов желательно запускать против тестовых стендов.
- Интеграционные тесты для прокси/таймаутов находятся в процессе добавления (см. roadmap).

## Поддерживаемые техники и БД

- MongoDB
  - Boolean-based ($where: return true/false)
  - Error-based (некорректные операторы, ошибки валидации)
  - Type juggling (логические/числовые примитивы и несоответствия типов)
  - Базовые строковые payload-ы ($ne, $regex, $in), $where
- Elasticsearch
  - Lucene/Wildcard (скелет), script errors (в процессе)
- CouchDB
  - Mango selectors, \_all_docs (скелет)

## Лицензия

MIT

## Вклад и развитие

Перед разработкой ориентируйтесь на:

- Технические требования: [requirements.md](./requirements.md)
- Дорожную карту: [roadmap.md](./roadmap.md)

Процесс контрибуции описан в [CONTRIBUTING.md](./CONTRIBUTING.md).
