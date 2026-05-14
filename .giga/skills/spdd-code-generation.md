---
name: spdd-code-generation
description: Генерация кода на основе REASONS Canvas с соблюдением Operations, Norms и Safeguards
globs: **/*
---

> **Note**: Этот скилл синхронизирован с `.agents/skills/spdd-code-generation.md`. Редактируйте основной файл.

# SPDD Code Generation

Этот скилл генерирует код строго следуя REASONS Canvas, фокусируясь на Operations, Norms и Safeguards.

## Принцип работы

1. **Читай Canvas полностью** — пойми контекст до начала кодирования
2. **Следуй Operations последовательно** — выполняй шаги по порядку
3. **Соблюдай Norms** — все стандарты кодирования
4. **Уважай Safeguards** — никогда не нарушай границы

## Процесс генерации

### Шаг 1: Подготовка

```markdown
## Анализ Canvas

**Задача:** [название из Canvas]
**Operations этапов:** [N]
**Ключевые Norms:** [список]
**Критические Safeguards:** [список]
```

### Шаг 2: Реализация по этапам

Для каждого этапа из Operations:

```markdown
### Этап: [Название этапа]

**Шаги:**
1. [ ] [Шаг 1] — [файлы для изменения]
2. [ ] [Шаг 2] — [файлы для изменения]

**Ожидаемый результат:** [что должно работать]
```

### Шаг 3: Проверка соответствия

Перед завершением каждого шага:

```markdown
## Checkpoint: [Название шага]

### Соответствие Requirements
- [ ] Все функциональные требования выполнены
- [ ] DoD критерии достигнуты

### Соблюдение Norms
- [ ] Именование соответствует стандартам
- [ ] Код отформатирован согласно правилам
- [ ] Логирование добавлено где нужно
- [ ] Тесты написаны

### Проверка Safeguards
- [ ] Нет нарушения безопасности
- [ ] Производительность в пределах
- [ ] Инварианты соблюдены
```

## Шаблоны генерации

### Компонент (React/Vue)

```typescript
{{ filepath: src/components/[ComponentName].tsx }}

import React from 'react';
import { className } from './[ComponentName].module.css';
import { logger } from '@/utils/logger';

interface [ComponentName]Props {
  /** Описание пропса */
  id: string;
  onChange?: (value: string) => void;
}

/**
 * [ComponentName] — [краткое описание]
 * 
 * Используется для: [цель компонента]
 * Зависимости: [список]
 */
export const [ComponentName]: React.FC[[ComponentName]Props] = ({
  id,
  onChange,
}) => {
  // Guard clause для обязательных полей
  if (!id) {
    logger.error('[ComponentName]: id is required');
    throw new Error('id is required');
  }

  const handleChange = (value: string) => {
    // Валидация входных данных
    if (value.length > 100) {
      logger.warn('[ComponentName]: value exceeds max length');
      return;
    }
    
    onChange?.(value);
  };

  return (
    <div className={className}>
      {/* JSX content */}
    </div>
  );
};
```

### Сервис

```typescript
{{ filepath: src/services/[ServiceName].ts }}

import { Repository } from '@/repositories';
import { [EntityName] } from '@/models';
import { logger } from '@/utils/logger';
import { metrics } from '@/utils/metrics';

export class [ServiceName] {
  constructor(
    private readonly repository: Repository<[EntityName]>,
  ) {}

  /**
   * [Action] — [описание]
   * 
   * @param input — [описание параметра]
   * @returns [описание результата]
   * @throws [EntityNotFoundError] — когда [EntityName] не найден
   * 
   * @safeguard Idempotency: вызов с теми же данными не создает дубликаты
   * @performance Комплексность: O(n) где n — количество записей
   */
  async [action](input: [InputDto]): Promise<[OutputDto]> {
    const timer = metrics.startTimer('[service]_[action]_duration');
    
    try {
      // Валидация входных данных
      this.validateInput(input);
      
      // Defensive coding: проверка на null/undefined
      const result = await this.repository.findBy(input.id);
      
      if (!result) {
        logger.warn(`[ServiceName]_[action]: [EntityName] not found`, { id: input.id });
        throw new [EntityName]NotFoundError(input.id);
      }

      // Бизнес-логика
      const output = this.transformResult(result);
      
      logger.info(`[ServiceName]_[action]: success`, { 
        id: input.id,
        duration: timer(),
      });
      
      return output;
    } catch (error) {
      logger.error(`[ServiceName]_[action]: failed`, {
        input,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    } finally {
      timer();
    }
  }

  private validateInput(input: [InputDto]): void {
    // Defensive validation
    if (!input.id) {
      throw new ValidationError('id is required');
    }
    
    if (input.value < 0) {
      throw new ValidationError('value must be non-negative');
    }
  }

  private transformResult(result: [EntityName]): [OutputDto] {
    return {
      id: result.id,
      // ... mapping
    };
  }
}
```

### API Route

```typescript
{{ filepath: src/routes/[resource].ts }}

import { Router } from 'express';
import { [ServiceName] } from '@/services';
import { validate } from '@/middleware/validation';
import { authenticate } from '@/middleware/auth';
import { [InputSchema] } from '@/schemas/[resource]';

const router = Router();
const service = new [ServiceName]();

/**
 * POST /api/[resource]
 * @summary [Описание эндпоинта]
 * @security Bearer Token
 * @requestBody [InputSchema]
 * @response 201 Created
 * @response 400 Bad Request
 * @response 401 Unauthorized
 */
router.post(
  '/',
  authenticate,
  validate([InputSchema]),
  async (req, res, next) => {
    try {
      // Safeguard: Rate limiting обрабатывается на уровне middleware
      // Safeguard: Input validation пройдена
      
      const result = await service.[action](req.body);
      
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/[resource]/:id
 * @summary Получить [entity] по ID
 * @security Bearer Token
 */
router.get(
  '/:id',
  authenticate,
  async (req, res, next) => {
    try {
      // Safeguard: ID валидирован через параметр маршрута
      
      const result = await service.getById(req.params.id);
      
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
```

### Модель данных

```typescript
{{ filepath: src/models/[EntityName].ts }}

import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { [RelatedEntity] } from './[RelatedEntity]';

export enum [EntityName]Status {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

/**
 * [EntityName] — [описание сущности]
 * 
 * @invariant status не может быть изменен после архивации
 * @performance Индексированы поля: id, status, createdAt
 */
@Entity('[table_name]')
export class [EntityName] {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ 
    type: 'varchar', 
    length: 100,
    nullable: false,
  })
  name: string;

  @Column({
    type: 'enum',
    enum: [EntityName]Status,
    default: [EntityName]Status.DRAFT,
  })
  status: [EntityName]Status;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  amount: number;

  @OneToMany(() => [RelatedEntity], (entity) => entity.[entityName])
  [relatedEntities]: [RelatedEntity][];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * @safeguard Нельзя архивировать сущность с активными связями
   */
  canArchive(): boolean {
    return this.[relatedEntities].length === 0;
  }

  /**
   * @invariant Статус меняется только в допустимых переходах
   */
  transitionTo(newStatus: [EntityName]Status): void {
    const validTransitions: Record<[EntityName]Status, [EntityName]Status[]> = {
      [EntityName]Status.DRAFT: [EntityName]Status.ACTIVE,
      [EntityName]Status.ACTIVE: [EntityName]Status.ARCHIVED,
      [EntityName]Status.ARCHIVED: [], // Неизменяемый
    };

    if (!validTransitions[this.status].includes(newStatus)) {
      throw new InvalidStatusTransitionError(this.status, newStatus);
    }

    this.status = newStatus;
  }
}
```

### Тесты

```typescript
{{ filepath: src/services/[ServiceName].test.ts }}

import { [ServiceName] } from './[ServiceName]';
import { Repository } from '@/repositories';
import { [EntityName] } from '@/models';

describe('[ServiceName]', () => {
  let service: [ServiceName];
  let mockRepository: jest.Mocked<Repository<[EntityName]>>;

  beforeEach(() => {
    mockRepository = {
      findBy: jest.fn(),
      save: jest.fn(),
      // ... другие методы
    } as any;
    
    service = new [ServiceName](mockRepository);
  });

  describe('[action]', () => {
    const validInput = {
      id: 'test-id',
      value: 100,
    };

    it('должен успешно выполнить [action] с валидным входом', async () => {
      // Given
      mockRepository.findBy.mockResolvedValue({
        id: 'test-id',
        value: 100,
      } as [EntityName]);

      // When
      const result = await service.[action](validInput);

      // Then
      expect(result).toMatchObject({
        id: 'test-id',
      });
      expect(mockRepository.findBy).toHaveBeenCalledWith('test-id');
    });

    it('должен выбросить ошибку когда [EntityName] не найден', async () => {
      // Given
      mockRepository.findBy.mockResolvedValue(null);

      // When & Then
      await expect(service.[action](validInput))
        .rejects.toThrow([EntityName]NotFoundError);
    });

    it('должен валидировать входные данные', async () => {
      // Given
      const invalidInput = { id: '', value: -1 };

      // When & Then
      await expect(service.[action](invalidInput))
        .rejects.toThrow(ValidationError);
    });

    it('должен логировать ошибку при неудаче', async () => {
      // Given
      mockRepository.findBy.mockRejectedValue(new Error('DB error'));

      // When
      try {
        await service.[action](validInput);
      } catch (error) {
        // Then
        // Проверка логирования через mock
      }
    });
  });
});
```

## Checkpoints для генерации

После каждого этапа Operations:

```markdown
## Stage Complete: [Название этапа]

### Файлы созданы/изменены
- [путь к файлу 1]
- [путь к файлу 2]

### Тесты
- [ ] Unit тесты написаны
- [ ] Покрытие >= 80%
- [ ] Все тесты проходят

### Код-ревью чеклист
- [ ] Читаемость кода
- [ ] Нет дублирования
- [ ] Обработка ошибок
- [ ] Логирование
- [ ] Производительность

### Safeguards верификация
- [ ] Нет секрета в коде
- [ ] Валидация всех входов
- [ ] Инварианты соблюдены
```

## Советы для качественной генерации

1. **Следуй Operations буквально** — не пропускай шаги
2. **Сначала тесты** — пиши тесты до или одновременно с кодом
3. **Defensive coding** — проверяй все предположения
4. **Логирование везде** — каждый важный путь должен быть залогирован
5. **Маленькие коммиты** — каждый этап — отдельный коммит
6. **Проверяй Safeguards** — перед финализацией проверь все границы
