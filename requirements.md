# Техническое задание: NoSQL Injection Scanner

## 1) Цели и охват
- Цель: автоматическое обнаружение NoSQL-инъекций и связанных логических дефектов в веб/API-приложениях.
- Поддерживаемые стеки/ДБ (минимум): **MongoDB**, **Elasticsearch/Lucene**, **CouchDB**, **Redis**, **Cassandra**, **Firebase/Firestore**, **DynamoDB**.  
- Каналы инъекций: **HTTP параметры**, **заголовки**, **cookies**, **GraphQL**, **WebSocket payloads**, **gRPC-gateway**.

## 2) Функциональные требования

### 2.1 Ввод/аутентификация
- Неаутентифицированный, cookie/JWT, OAuth2.
- Импорт спецификаций: OpenAPI, GraphQL introspection, Postman/Har.
- Поддержка сессий, CSRF, токенов.

### 2.2 Кроулер/Драйвер
- Slim-кроулер форм (HTML, JSON).
- Распознавание типов полей и схем.
- Обнаружение точек агрегации и поисковых эндпоинтов.

### 2.3 Генерация и отправка полезных нагрузок
- Payload по семейству БД и типу параметра.
- Boolean-based, time-based, error-based, blind via side-channel.
- Байпас: URL/двойное кодирование, dot-notation, bracket-notation, смешение типов.

### 2.4 Детектирование
- Подтверждение минимум 2 методами или сильное доказательство.
- Метрики: diff ответа, время, ошибки парсеров, побочные эффекты.

### 2.5 Безопасность
- Safe-by-default (запрет мутаций).
- Rate limiting, jitter, параллелизм.
- Do-not-touch списки, dry-run.

### 2.6 Отчётность
- JSON, SARIF 2.1.0, Markdown/PDF.
- PoC трассировки, воспроизводимые cURL.

## 3) Матрица детектов
- MongoDB: $ne/$gt/$in, $where, regex-DoS, projection-bypass, pipeline, dot-notation, type-juggling.
- Elasticsearch: Lucene query injection, script/Painless, wildcard/regexp.
- CouchDB: Mango selector, Map/Reduce, _all_docs/_find leakage.
- Redis: Command injection, ACL bypass.
- Cassandra: CQL injection, type conflicts.
- Firebase: Rules bypass, orderBy/limit/startAt инъекции.
- DynamoDB: Condition/FilterExpression injection, ProjectionExpression leakage.

## 4) Техники подтверждения
- Boolean-based, time-based, error-based, side-effects.

## 5) Нефункциональные требования
- ≥100 RPS при 4 воркерах.
- Повтор запросов, дедупликация находок.
- CLI + библиотека, Docker контейнер.
- Интеграции: CI/CD, Jira, GitHub Issues, Slack/Telegram.

## 6) Формат ответа
JSON-схема:
```json
{
  "id": "NOSQLI-2025-0001",
  "title": "MongoDB selector injection",
  "severity": "high",
  "db_family": "MongoDB",
  "endpoint": {"method": "POST", "url": "...", "parameter": "password"},
  "payload": {"injected": {"$ne": null}},
  "evidence": {"diff": {"status": [401,200]}},
  "remediation": ["Strict validation", "Parameterized filters"],
  "confidence": 0.92
}
```

## 7) Выходные форматы
- SARIF, Markdown Report, CSV, JUnit XML.

## 8) Интеграция
- Порог `--fail-on-severity`, baseline suppression.
- Exit codes: 0 — ок, 1 — vuln, 2 — error.

## 9) Логи/телеметрия
- JSONL-логи, p95 latency, RPS.
- Версия движка, включённые профили.

