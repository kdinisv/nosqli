# 🚀 Дорожная карта: NoSQL Injection Scanner

## Этап 1. Базовая архитектура (2–3 недели)

- [x] Создать минимально работоспособный сканер (MVP).
- [x] Определить язык и стек реализации (Node.js/Python).
- [x] Реализовать CLI-оболочку (scan, report, help).
- [x] Подключить поддержку базового ввода (URL, параметры, cookies).
- [x] Реализовать драйвер HTTP-запросов (retry, timeout, proxy):
  - [x] Retry: правила идемпотентности (по умолчанию GET/HEAD), список ретраибл-ошибок (ECONNRESET/ETIMEDOUT/ENOTFOUND, 502/503/504), maxAttempts, экспоненциальный backoff с jitter, предел максимальной задержки.
  - [x] Timeout: per-request + фазовые (headers/body), конфигурация из опций/CLI; корректное завершение и отчёт. (connect — TBD)
  - [x] Proxy: поддержка HTTP/HTTPS прокси (ProxyAgent), переменные окружения HTTP_PROXY/HTTPS_PROXY/NO_PROXY, переопределение через флаг CLI (--proxy), аутентификация через URL.
  - [x] Настройки/UX: флаги CLI (--retry-max, --retry-base-delay, --retry-max-delay, --retry-unsafe, --timeout, --proxy), чтение env, дефолты.
  - [x] Логи/метрики: JSONL-лог попыток (причины ретраев), счётчики ретраев/ошибок, p50/p95/max latency.
  - [x] Безопасность: по умолчанию не ретраить неидемпотентные методы, whitelist-флаг (--retry-unsafe).
  - [x] Тесты (unit): backoff/фильтры ошибок + флейковый сервер (503→200).
  - [ ] Тесты (интеграционные): медленный сервер (таймауты), прокси/NO_PROXY.
- [x] Скелет JSON-отчёта.

## Этап 2. Поддержка основных БД и техник (4–6 недель)

- [ ] MongoDB: boolean-based, error-based, type juggling.
- [ ] Elasticsearch: Lucene _:_, wildcard, script errors.
- [ ] CouchDB: Mango selectors, \_all_docs.
- [ ] Cassandra (CQL): error-based, типовые конфликты.
- [x] Реализация техник: boolean-based, time-based, error-based.
- [x] Система payload-шаблонов.

## Этап 3. Кроулер и интеграция (3–4 недели)

- [x] HTML-кроулер (формы GET/POST).
- [ ] Поддержка OpenAPI/Swagger и GraphQL introspection.
- [ ] Импорт Postman/Har файлов.
- [ ] Валидация типов параметров (строка/число/булево).

## Этап 4. Система подтверждения (2–3 недели)

- [ ] Реализовать статистическую проверку time-based (p-value).
- [ ] Сравнение хэшей тела ответа.
- [ ] Система confidence (0–1).
- [ ] Подтверждение минимум 2 независимыми методами.

## Этап 5. Отчётность и интеграции (3–4 недели)

- [ ] Экспорт SARIF 2.1.0, Markdown/PDF.
- [ ] Экспорт CSV/JUnit для CI.
- [ ] Выходные коды процесса (0/1/2).
- [ ] Интеграции с Jira, GitHub Issues, Slack/Telegram.

## Этап 6. Безопасность и производительность (2–3 недели)

- [ ] Safe-mode (запрет мутаций).
- [ ] Rate limiting, jitter.
- [ ] Настройка параллелизма.
- [ ] Логирование JSONL (все запросы/ответы).
- [ ] Docker-образ для развёртывания.

## Этап 7. Расширения и R&D

- [ ] Out-of-band подтверждение (webhooks).
- [ ] Поддержка Redis-гейтов и Firebase.
- [ ] ML-подсказки для payload-ов.
- [ ] Web-GUI для отчётов.

---

### Итоговые сроки

- **MVP:** 2–3 недели.
- **Полная базовая версия (Этапы 1–5):** ~3 месяца.
- **Продвинутая версия (Этапы 6–7):** +1–2 месяца.
