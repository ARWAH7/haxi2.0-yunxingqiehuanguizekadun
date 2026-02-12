# 设计文档

## 概述

本设计实现了一个固定容量的数据管理机制，确保每个采样规则只保留最新的264条符合规则的区块数据。通过在数据添加时进行限制，而不是在显示时裁剪，从根本上控制内存使用。

核心设计原则：
- **固定容量**: 每个规则维护最多264条数据（6行 × 44列）
- **自动淘汰**: 新数据到来时自动删除最旧数据
- **实时过滤**: WebSocket接收数据时立即应用规则过滤
- **降序排列**: 数据始终按区块高度降序排列（最新在前）

## 架构

### 数据流架构

```
TRON区块链 → Redis → WebSocket → 前端过滤 → allBlocks状态 → UI组件
                                    ↓
                                规则检查
                                    ↓
                                容量限制（264条）
```

### 关键组件

1. **WebSocket消息处理器** (App.tsx)
   - 接收实时区块数据
   - 应用规则过滤
   - 执行容量限制

2. **状态管理** (App.tsx)
   - allBlocks: 存储符合当前规则的最新264条数据
   - activeRuleRef: 存储当前激活规则的引用（供WebSocket使用）

3. **数据处理函数** (helpers.ts)
   - calculateBeadGrid: 珠盘路网格计算
   - calculateTrendGrid: 走势路网格计算

## 组件和接口

### 数据结构

```typescript
interface BlockData {
  height: number;        // 区块高度
  hash: string;          // 区块哈希
  resultValue: number;   // 结果值 (0-9)
  type: 'ODD' | 'EVEN';  // 单双类型
  sizeType: 'BIG' | 'SMALL'; // 大小类型
  timestamp: string;     // 时间戳
}

interface IntervalRule {
  id: string;
  label: string;
  value: number;         // 步长
  startBlock: number;    // 起始偏移
  trendRows: number;     // 走势路行数
  beadRows: number;      // 珠盘路行数
  dragonThreshold: number;
}
```

### 核心函数接口

```typescript
// 检查区块是否符合规则
function checkAlignment(height: number, rule: IntervalRule): boolean

// WebSocket消息处理
function handleWebSocketMessage(block: BlockData): void

// 容量限制函数
function limitBlocksCapacity(blocks: BlockData[], maxCount: number): BlockData[]
```

## 数据模型

### allBlocks 状态管理

**数据特征:**
- 类型: `BlockData[]`
- 排序: 按 `height` 降序（最新在前）
- 容量: 最多264条符合当前规则的数据
- 唯一性: 不包含重复的区块（基于height）

**更新时机:**
1. WebSocket接收到新的符合规则的区块
2. 用户切换激活规则（重新加载数据）
3. 内存清理触发（紧急情况）

### activeRuleRef 引用管理

**目的:** 解决WebSocket闭包问题

由于WebSocket的useEffect依赖数组为空（只在组件挂载时连接一次），闭包会捕获初始的activeRule值。使用ref可以在WebSocket回调中访问最新的规则。

```typescript
const activeRuleRef = useRef<IntervalRule | undefined>(undefined);

// 同步更新ref
useEffect(() => {
  activeRuleRef.current = activeRule;
}, [activeRule]);

// WebSocket中使用ref获取最新规则
ws.onmessage = (event) => {
  const currentRule = activeRuleRef.current;
  // 使用currentRule进行过滤
};
```

## 正确性属性

*属性是一个特征或行为，应该在系统的所有有效执行中保持为真——本质上是关于系统应该做什么的正式陈述。属性作为人类可读规范和机器可验证正确性保证之间的桥梁。*

### 属性 1: 容量不变量

*对于任意* 时刻的 allBlocks 状态，其长度应该永远不超过 264 条数据。

**验证: 需求 1.1**

### 属性 2: 降序不变量

*对于任意* 时刻的 allBlocks 数组，所有相邻元素应该满足 `allBlocks[i].height > allBlocks[i+1].height`（降序排列）。

**验证: 需求 1.4**

### 属性 3: 规则过滤属性

*对于任意* 添加到 allBlocks 的区块，该区块必须符合当前激活规则的步长和偏移条件。

**验证: 需求 2.1, 2.2, 2.4**

### 属性 4: 容量限制和淘汰属性

*对于任意* 导致数据量超过 264 条的新区块添加操作，操作完成后 allBlocks 应该只包含最新的 264 条数据，最旧的数据应该被删除。

**验证: 需求 1.2, 2.3**

### 属性 5: 插入位置属性

*对于任意* 新添加的符合规则的区块，该区块应该出现在 allBlocks 数组的第一个位置（索引 0），且其 height 应该大于所有其他区块的 height。

**验证: 需求 1.3**

## 错误处理

### WebSocket 连接错误

- **场景**: WebSocket 连接失败或断开
- **处理**: 显示连接错误提示，自动重连（最多30次）
- **降级**: 如果 WebSocket 持续失败，不影响现有数据的显示

### 数据解析错误

- **场景**: WebSocket 接收到无效的 JSON 数据
- **处理**: 捕获异常，记录错误日志，跳过该消息
- **影响**: 单条消息失败不影响后续数据接收

### 规则引用错误

- **场景**: activeRuleRef.current 为 undefined
- **处理**: 使用默认规则（步长为1，无偏移）
- **日志**: 输出警告信息到控制台

### 重复区块处理

- **场景**: 接收到已存在的区块（相同 height）
- **处理**: 跳过添加，保持现有数据不变
- **验证**: 使用 Map 去重确保唯一性

## 测试策略

### 双重测试方法

本设计采用单元测试和属性测试相结合的方式：

**单元测试** 用于验证：
- 特定的边界情况（如恰好264条数据）
- 错误处理逻辑（如无效数据、连接失败）
- 集成点（如 WebSocket 消息处理流程）

**属性测试** 用于验证：
- 容量不变量（属性1）
- 降序不变量（属性2）
- 规则过滤属性（属性3）
- 容量限制和淘汰属性（属性4）
- 插入位置属性（属性5）

### 属性测试配置

- **测试库**: 使用 fast-check（JavaScript/TypeScript 的属性测试库）
- **迭代次数**: 每个属性测试至少运行 100 次
- **标签格式**: `Feature: data-limit-264, Property {number}: {property_text}`

### 测试数据生成

**区块数据生成器:**
```typescript
// 生成随机区块
fc.record({
  height: fc.integer({ min: 1, max: 1000000 }),
  hash: fc.hexaString({ minLength: 64, maxLength: 64 }),
  resultValue: fc.integer({ min: 0, max: 9 }),
  type: fc.constantFrom('ODD', 'EVEN'),
  sizeType: fc.constantFrom('BIG', 'SMALL'),
  timestamp: fc.date().map(d => d.toISOString())
})
```

**规则生成器:**
```typescript
// 生成随机规则
fc.record({
  id: fc.uuid(),
  label: fc.string(),
  value: fc.integer({ min: 1, max: 100 }),
  startBlock: fc.integer({ min: 0, max: 1000 }),
  trendRows: fc.constant(6),
  beadRows: fc.constant(6),
  dragonThreshold: fc.constant(3)
})
```

### 单元测试用例

1. **边界测试**: 测试恰好264条数据时的行为
2. **空数据测试**: 测试 allBlocks 为空时添加第一条数据
3. **规则切换测试**: 测试切换规则后数据是否正确过滤
4. **重复区块测试**: 测试添加重复区块时的去重逻辑
5. **排序测试**: 测试乱序添加后数据是否正确排序
