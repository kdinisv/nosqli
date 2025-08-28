# @kdinisv/nosqli

Лёгкий сканер NoSQL-инъекций с CLI и библиотекой, вдохновлённый NoSQLMap, с интерфейсом наподобие sql-scanner.

## Возможности

- Тестирование GET-параметров строковыми полезными нагрузками (MongoDB-ориентированные).
- Тестирование JSON-тела (POST/PUT/PATCH) вставкой операторов ($ne, $regex, $in и т.д.).
- Простая эвристика: дифф статуса/размера ответа и поисковые ключевые слова ошибок MongoDB.
- CLI и программный API.

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

## Программный API

```js
const { Scanner } = require("@kdinisv/nosqli");
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

## Ограничения и заметки

- Инструмент проводит пассивно-активные проверки, ориентированные на MongoDB. Он не эксплуатирует уязвимость, а только ищет индикаторы.
- Для других движков NoSQL потребуется расширить пэйлоады.
- Для точности результатов желательно запускать против тестовых стендов.

## Лицензия

MIT
