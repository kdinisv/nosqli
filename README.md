# @kdinisv/nosqli

Лёгкий сканер NoSQL-инъекций с CLI и библиотекой, вдохновлённый NoSQLMap, с интерфейсом наподобие sql-scanner.

## Возможности

Базовый синтаксис:

```
nosqli-scan <url> [options]
```

Сканирование параметров и тела

| Опция               | Алиас | Описание                                            | По умолчанию |
| ------------------- | ----- | --------------------------------------------------- | ------------ |
| --get-params <list> | -g    | GET-параметры через запятую для инъекций            | —            |
| --method <verb>     | -X    | HTTP-метод для сканирования тела                    | POST         |
| --fields <list>     | -f    | Поля JSON-тела через запятую                        | —            |
| --body <json>       | -d    | Базовое JSON-тело                                   | —            |
| --dos               | —     | DoS-пэйлоуды ($where/$regex задержка)               | false        |
| --manipulation      | —     | Широкие фильтры для массовых обновлений (эвристика) | false        |

Краулер

| Опция           | Алиас | Описание                                                | По умолчанию |
| --------------- | ----- | ------------------------------------------------------- | ------------ |
| --crawl         | -C    | Обойти сайт от URL и сканировать найденные ссылки/формы | false        |
| --max-pages <n> | —     | Лимит страниц                                           | 50           |
| --max-depth <n> | —     | Глубина обхода                                          | 3            |
| --offsite       | —     | Разрешить переход на другие origin                      | false        |

Заголовки/куки/GraphQL

| Опция                   | Алиас | Описание                                 | По умолчанию |
| ----------------------- | ----- | ---------------------------------------- | ------------ |
| --headers-scan          | —     | Фуззинг заголовков                       | false        |
| --header-names <list>   | —     | Список заголовков для фуззинга           | —            |
| --header "K: V"         | -H    | Добавить заголовок (флаг повторяемый)    | —            |
| --cookies-scan          | —     | Фуззинг кук                              | false        |
| --cookie-names <list>   | —     | Список кук                               | —            |
| --graphql-scan          | —     | Сканировать GraphQL (нужны query/fields) | false        |
| --graphql-query <str>   | —     | Текст GraphQL операции                   | —            |
| --graphql-fields <list> | —     | Поля переменных для фуззинга             | —            |
| --graphql-opname <str>  | —     | operationName (опционально)              | —            |

Драйвер HTTP и стабильность

| Опция                   | Алиас | Описание                           | По умолчанию |
| ----------------------- | ----- | ---------------------------------- | ------------ |
| --timeout <ms>          | -t    | Таймаут запроса                    | 8000         |
| --retry-max <n>         | —     | Макс. попыток (включая первую)     | 1            |
| --retry-base-delay <ms> | —     | База экспоненциального бэкоффа     | 200          |
| --retry-max-delay <ms>  | —     | Предел задержки бэкоффа            | 2000         |
| --retry-unsafe          | —     | Ретраи для неидемпотентных методов | false        |
| --proxy <url>           | —     | Прокси (учитывает NO_PROXY)        | —            |
| --delay <ms>            | -D    | Пауза между запросами              | 50           |
| --dos-threshold <ms>    | —     | Порог задержки для DoS-детекции    | 1000         |

Отчётность/вывод

| Опция               | Алиас | Описание                                       | По умолчанию |
| ------------------- | ----- | ---------------------------------------------- | ------------ |
| --format <raw/spec> | —     | Формат вывода (список или спецификация)        | raw          |
| --http-jsonl <path> | —     | Писать попытки HTTP в JSONL                    | —            |
| --db-family <name>  | —     | Целевая СУБД (MongoDB/Elasticsearch/CouchDB)   | MongoDB      |
| --fingerprint       | -F    | Попытка определить движок/версию (best‑effort) | false        |

Отладка

| Опция                | Алиас | Описание                                          | По умолчанию |
| -------------------- | ----- | ------------------------------------------------- | ------------ |
| --debug              | —     | Подробные события (fetch/inject/evidence/crawler) | false        |
| --debug-jsonl <path> | —     | Писать отладочные события в JSONL                 | —            |

Примечание: также поддерживаются переменные окружения HTTP_PROXY/HTTPS_PROXY/NO_PROXY; `NOSQLI_DEBUG_STDERR=1` дублирует debug-сообщения в stderr.

Примеры:

- Сканирование параметров и тела:

  - `-g, --get-params <list>` — список GET-параметров через запятую для инъекций.
  - `-X, --method <verb>` — метод для сканирования тела (по умолчанию POST).
  - `-f, --fields <list>` — список полей JSON-тела для инъекций.
  - `-d, --body <json>` — базовое JSON-тело.
  - `--dos` — включить DoS-пэйлоады (замедление через $where/$regex).
  - `--manipulation` — попытка широких фильтров для массовых обновлений (эвристика).

- Краулер:

  - `-C, --crawl` — обойти сайт от указанного URL и сканировать найденные ссылки/формы.
  - `--max-pages <n>` — лимит страниц (по умолчанию 50).
  - `--max-depth <n>` — глубина (по умолчанию 3).
  - `--offsite` — разрешить переход на другие origin.

- Заголовки/куки/GraphQL:

  - `--headers-scan` — фуззинг заголовков; `--header-names <list>` — какие заголовки.
  - `-H, --header "K: V"` — задать произвольный заголовок (повторяемый флаг).
  - `--cookies-scan` — фуззинг кук; `--cookie-names <list>` — какие куки.
  - `--graphql-scan` — сканировать GraphQL; требуется `--graphql-query`, `--graphql-fields` и опционально `--graphql-opname`.

- Драйвер HTTP и стабильность:

  - `-t, --timeout <ms>` — таймаут запроса (по умолчанию 8000).
  - `--retry-max <n>` — максимум попыток (включая первую).
  - `--retry-base-delay <ms>` — базовая задержка бэкоффа.
  - `--retry-max-delay <ms>` — максимум задержки бэкоффа.
  - `--retry-unsafe` — разрешить ретраи для неидемпотентных методов.
  - `--proxy <url>` — явный прокси (учитывает NO_PROXY).
  - `-D, --delay <ms>` — пауза между запросами (по умолчанию 50).
  - `--dos-threshold <ms>` — порог задержки для детекции DoS (по умолчанию 1000).

- Отчётность/вывод:

  - `--format raw|spec` — формат вывода (raw — список находок, spec — структурированный отчёт).
  - `--http-jsonl <path>` — писать попытки HTTP в JSONL.
  - `--db-family MongoDB|Elasticsearch|CouchDB` — выбрать целевую СУБД для шаблонов.
  - `-F, --fingerprint` — попытаться определить движок/версию по заголовкам/телу.

- Отладка:
  - `--debug` — включить подробное логирование шагов (fetch/inject/evidence/crawler).
  - `--debug-jsonl <path>` — писать отладочные события в JSONL.
  - Дополнительно: `NOSQLI_DEBUG_STDERR=1` — дублировать debug-сообщения в stderr.

Примеры:

```
# Сканирование GET-параметра
nosqli-scan https://target/app?q=a -g q --format spec

# Сканирование формы логина (username)
nosqli-scan https://target/login -X POST -f username -d '{"username":"a","password":"b"}'

# Краулер с ограничениями и дебагом
nosqli-scan https://target/ -C --max-pages 40 --max-depth 3 --debug --debug-jsonl dbg.jsonl

# Фуззинг заголовков и DoS-проверки
nosqli-scan https://target/api -H 'Authorization: Bearer XXX' --headers-scan --dos --dos-threshold 800

# Скан GraphQL переменных
nosqli-scan https://target/graphql \
  --graphql-scan --graphql-opname GetUser \
  --graphql-query '{ user(id: $id) { id name } }' \
  --graphql-fields id
```

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
