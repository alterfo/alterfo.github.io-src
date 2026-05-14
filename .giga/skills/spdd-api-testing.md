---
name: spdd-api-testing
description: Генерация cURL-based API тестов для SPDD
globs: **/*
---

> **Note**: Этот скилл синхронизирован с `.agents/skills/spdd-api-testing.md`. Редактируйте основной файл.

# SPDD API Testing

Этот скилл генерирует cURL-based API тесты, покрывающие нормальные, граничные и ошибочные сценарии.

## Структура API тестов

```bash
tests/api/
├── [resource]/
│   ├── create.test.sh      # Тесты создания
│   ├── read.test.sh        # Тесты чтения
│   ├── update.test.sh      # Тесты обновления
│   ├── delete.test.sh      # Тесты удаления
│   └���─ run-all.sh          # Запуск всех тестов
└── README.md
```

## Шаблон тестового файла

```bash
{{ filepath: tests/api/[resource]/create.test.sh }}

#!/bin/bash

# Test Suite: Create [Resource]
# Description: Тесты для POST /api/[resource]

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
ENDPOINT="/api/[resource]"
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

# Helper functions
pass() {
  echo -e "${GREEN}✓${NC} $1"
  ((PASSED++))
}

fail() {
  echo -e "${RED}✗${NC} $1"
  ((FAILED++))
}

# ============================================
# Test Case 1: Успешное создание с валидными данными
# ============================================
echo ""
echo "Test Case 1: Успешное создание с валидными данными"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${BASE_URL}${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TEST_USER_TOKEN}" \
  -d '{
    "name": "Test [Resource]",
    "description": "Test description",
    "amount": 100
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
  pass "Получен статус 201 Created"
else
  fail "Ожидался 201, получен $HTTP_CODE"
  echo "Response: $BODY"
fi

# Проверка структуры ответа
if echo "$BODY" | jq -e '.success == true' > /dev/null; then
  pass "Ответ содержит success: true"
else
  fail "Ответ не содержит success: true"
fi

if echo "$BODY" | jq -e '.data.id' > /dev/null; then
  pass "Ответ содержит data.id"
else
  fail "Ответ не содержит data.id"
fi

# Сохраняем ID для последующих тестов
TEST_ID=$(echo "$BODY" | jq -r '.data.id')

# ============================================
# Test Case 2: Создание без токена аутентификации
# ============================================
echo ""
echo "Test Case 2: Создание без токена аутентификации"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${BASE_URL}${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test",
    "amount": 100
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "401" ]; then
  pass "Получен статус 401 Unauthorized"
else
  fail "Ожидался 401, получен $HTTP_CODE"
fi

# ============================================
# Test Case 3: Создание без обязательного поля name
# ============================================
echo ""
echo "Test Case 3: Создание без обязательного поля name"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${BASE_URL}${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TEST_USER_TOKEN}" \
  -d '{
    "amount": 100
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "400" ]; then
  pass "Получен статус 400 Bad Request"
else
  fail "Ожидался 400, получен $HTTP_CODE"
fi

if echo "$BODY" | jq -e '.errors' > /dev/null; then
  pass "Ответ содержит ошибки валидации"
else
  fail "Ответ не содержит ошибок валидации"
fi

# ============================================
# Test Case 4: Создание с пустым именем
# ============================================
echo ""
echo "Test Case 4: Создание с пустым именем"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${BASE_URL}${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TEST_USER_TOKEN}" \
  -d '{
    "name": "",
    "amount": 100
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "400" ]; then
  pass "Получен статус 400 для пустого имени"
else
  fail "Ожидался 400, получен $HTTP_CODE"
fi

# ============================================
# Test Case 5: Создание с именем превышающим лимит
# ============================================
echo ""
echo "Test Case 5: Создание с именем превышающим лимит (100 символов)"

LONG_NAME=$(printf 'a%.0s' {1..101})

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${BASE_URL}${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TEST_USER_TOKEN}" \
  -d "{
    \"name\": \"${LONG_NAME}\",
    \"amount\": 100
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "400" ]; then
  pass "Получен статус 400 для слишком длинного имени"
else
  fail "Ожидался 400, получен $HTTP_CODE"
fi

# ============================================
# Test Case 6: Создание с отрицательным значением amount
# ============================================
echo ""
echo "Test Case 6: Создание с отрицательным значением amount"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${BASE_URL}${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TEST_USER_TOKEN}" \
  -d '{
    "name": "Test",
    "amount": -100
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "400" ]; then
  pass "Получен статус 400 для отрицательного amount"
else
  fail "Ожидался 400, получен $HTTP_CODE"
fi

# ============================================
# Test Case 7: Idempotency — повторный запрос с теми же данными
# ============================================
echo ""
echo "Test Case 7: Idempotency — создание с уникальным ключом"

IDEMPOTENCY_KEY="test-idempotency-$(date +%s)"

RESPONSE1=$(curl -s -w "\n%{http_code}" -X POST \
  "${BASE_URL}${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TEST_USER_TOKEN}" \
  -H "Idempotency-Key: ${IDEMPOTENCY_KEY}" \
  -d '{
    "name": "Idempotent Test",
    "amount": 200
  }')

HTTP_CODE1=$(echo "$RESPONSE1" | tail -n1)

RESPONSE2=$(curl -s -w "\n%{http_code}" -X POST \
  "${BASE_URL}${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TEST_USER_TOKEN}" \
  -H "Idempotency-Key: ${IDEMPOTENCY_KEY}" \
  -d '{
    "name": "Idempotent Test",
    "amount": 200
  }')

HTTP_CODE2=$(echo "$RESPONSE2" | tail -n1)

if [ "$HTTP_CODE1" = "201" ] && [ "$HTTP_CODE2" = "201" ]; then
  # Проверяем что ID совпадают
  ID1=$(echo "$RESPONSE1" | sed '$d' | jq -r '.data.id')
  ID2=$(echo "$RESPONSE2" | sed '$d' | jq -r '.data.id')
  
  if [ "$ID1" = "$ID2" ]; then
    pass "Idempotency работает — создается один и тот же ресурс"
  else
    fail "Idempotency нарушен — созданы разные ресурсы"
  fi
else
  fail "Ожидались оба 201, получены $HTTP_CODE1 и $HTTP_CODE2"
fi

# ============================================
# Test Case 8: Rate limiting — много запросов подряд
# ============================================
echo ""
echo "Test Case 8: Rate limiting — 100 запросов в минуту"

RATE_LIMIT_FAILED=0

for i in {1..100}; do
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "${BASE_URL}${ENDPOINT}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TEST_USER_TOKEN}" \
    -d '{
      "name": "Rate Test '"$i"'",
      "amount": 50
    }')
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" = "429" ]; then
    RATE_LIMIT_FAILED=$((RATE_LIMIT_FAILED + 1))
  fi
done

if [ $RATE_LIMIT_FAILED -gt 0 ]; then
  pass "Rate limiting сработал — заблокировано $RATE_LIMIT_FAILED запросов"
else
  echo "⚠ Rate limiting не сработал (может быть нормально если лимит высокий)"
fi

# ============================================
# Cleanup
# ============================================
echo ""
echo "Cleanup: Удаляем созданные тестовые данные"

if [ -n "$TEST_ID" ]; then
  curl -s -X DELETE \
    "${BASE_URL}${ENDPOINT}/${TEST_ID}" \
    -H "Authorization: Bearer ${TEST_USER_TOKEN}" > /dev/null
  
  pass "Тестовый ресурс удален"
fi

# ============================================
# Summary
# ============================================
echo ""
echo "================================"
echo "Test Summary"
echo "================================"
echo -e "Passed:  ${GREEN}${PASSED}${NC}"
echo -e "Failed:  ${RED}${FAILED}${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed${NC}"
  exit 1
fi
```

## Файл запуска всех тестов

```bash
{{ filepath: tests/api/[resource]/run-all.sh }}

#!/bin/bash

# Run all API tests for [Resource]

set -e

echo "================================"
echo "Running API Tests for [Resource]"
echo "================================"
echo ""

# Check if server is running
if ! curl -s "${BASE_URL:-http://localhost:3000}/health" > /dev/null; then
  echo "Error: Server is not running at ${BASE_URL:-http://localhost:3000}"
  echo "Start the server before running tests"
  exit 1
fi

# Check if test token exists
if [ -z "$TEST_USER_TOKEN" ]; then
  echo "Error: TEST_USER_TOKEN environment variable is not set"
  echo "Run: export TEST_USER_TOKEN=<your-token>"
  exit 1
fi

# Run test suites
echo "1. Running CREATE tests..."
bash create.test.sh

echo ""
echo "2. Running READ tests..."
bash read.test.sh

echo ""
echo "3. Running UPDATE tests..."
bash update.test.sh

echo ""
echo "4. Running DELETE tests..."
bash delete.test.sh

echo ""
echo "================================"
echo "All test suites completed"
echo "================================"
```

## Шаблон для тестов чтения

```bash
{{ filepath: tests/api/[resource]/read.test.sh }}

#!/bin/bash

# Test Suite: Read [Resource]

# ... (аналогичная структура)

# Test Case: Получить несуществующий ресурс
# Test Case: Получить с валидным токеном
# Test Case: Получить список с пагинацией
# Test Case: Фильтрация по статусу
# Test Case: Сортировка по полю
```

## Генерация тестов из Canvas

Когда получаешь REASONS Canvas, используй следующую структуру:

```markdown
## Генерация API тестов

### Из Requirements
**Эндпоинты для тестирования:**
- POST /api/[resource] — создание
- GET /api/[resource]/:id — получение
- PATCH /api/[resource]/:id — обновление
- DELETE /api/[resource]/:id — удаление

### Из Entities
**Валидация полей:**
- name: string, required, max 100 chars
- amount: number, required, >= 0
- status: enum, default 'draft'

### Из Safeguards
**Сценарии безопасности:**
- [ ] Без токена → 401
- [ ] С чужим токеном → 403
- [ ] Rate limiting → 429
- [ ] Idempotency → одинаковый результат

**Граничные случаи:**
- [ ] Пустые значения
- [ ] Максимальная длина
- [ ] Минимальное/максимальное число
- [ ] Специальные символы

### Из Norms
**Требования к тестам:**
- Все тесты должны быть в отдельных файлах
- Использовать Given-When-Then структуру
- Логировать детали失败
- Очищать тестовые данные
```

## Запуск тестов

```bash
# Установка зависимостей
npm install

# Настройка окружения
export BASE_URL=http://localhost:3000
export TEST_USER_TOKEN=<your-jwt-token>

# Запуск всех тестов
bash tests/api/[resource]/run-all.sh

# Запуск конкретного теста
bash tests/api/[resource]/create.test.sh
```

## Интеграция с CI/CD

```yaml
{{ filepath: .github/workflows/api-tests.yml }}

name: API Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  api-tests:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: yarn install
      
      - name: Run migrations
        run: yarn database:migrate
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/test
      
      - name: Start server
        run: yarn start &
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/test
      
      - name: Wait for server
        run: sleep 10
      
      - name: Run API tests
        run: bash tests/api/run-all.sh
        env:
          BASE_URL: http://localhost:3000
          TEST_USER_TOKEN: ${{ secrets.TEST_TOKEN }}
```

## Советы для качественных API тестов

1. **Покрывай все HTTP методы** — CRUD операции
2. **Тестируй ошибки** — 4xx и 5xx ответы
3. **Проверяй валидацию** — граничные значения
4. **Тестируй безопасность** — auth, rate limiting
5. **Используй real data** — не только mocks
6. **Очищай после себя** — удаляй тестовые данные
7. **Делай независимыми** — порядок запуска не важен
8. **Логгируй детали** — для отладки失败
