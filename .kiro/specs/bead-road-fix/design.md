# 设计文档：修复珠盘路显示问题

## 概述

本设计文档描述了如何修复单双、大小珠盘路的显示问题。主要修复内容包括：

1. 修复 `calculateBeadGrid` 函数，使其正确使用 `interval` 和 `startBlock` 参数进行数据过滤
2. 优化珠盘路数据填充逻辑，实现按列滑动机制
3. 确保珠盘路正确响应规则切换
4. 保持数据一致性，确保前端显示与后端过滤的数据一致

## 架构

### 数据流

```
TRON 区块链 → 后端 API → WebSocket → App.tsx (allBlocks 状态)
                                              ↓
                                    BeadRoad 组件 (blocks 属性)
                                              ↓
                                    calculateBeadGrid 函数
                                              ↓
                                    珠盘路网格 (6行 × 44列)
```

### 关键组件

1. **App.tsx**：负责接收 WebSocket 数据，根据当前规则过滤区块，维护 `allBlocks` 状态
2. **BeadRoad.tsx**：珠盘路组件，接收 `blocks` 属性，调用 `calculateBeadGrid` 函数生成网格
3. **helpers.ts**：包含 `calculateBeadGrid` 函数，负责将区块数据转换为珠盘路网格

## 组件和接口

### calculateBeadGrid 函数

**当前签名：**
```typescript
export const calculateBeadGrid = (
  blocks: BlockData[],
  typeKey: 'type' | 'sizeType',
  rows: number = 6,
  interval: number = 1,      // ❌ 未使用
  startBlock: number = 0     // ❌ 未使用
): GridCell[][] => { ... }
```

**修复后签名（保持不变）：**
```typescript
export const calculateBeadGrid = (
  blocks: BlockData[],
  typeKey: 'type' | 'sizeType',
  rows: number = 6,
  interval: number = 1,      // ✅ 将被使用
  startBlock: number = 0     // ✅ 将被使用
): GridCell[][] => { ... }
```

**参数说明：**
- `blocks`: 区块数据数组（已按高度降序排列，最新的在前）
- `typeKey`: 数据类型键（'type' 表示单双，'sizeType' 表示大小）
- `rows`: 珠盘路行数（固定为 6）
- `interval`: 规则步长（每隔多少个区块采样一次）
- `startBlock`: 规则起始偏移（从哪个区块高度开始采样）

**返回值：**
- `GridCell[][]`: 44列 × rows行的二维数组，每个单元格包含类型、值和区块高度信息

### BeadRoad 组件

**属性接口：**
```typescript
interface BeadRoadProps {
  blocks: BlockData[];        // 已过滤的区块数据
  mode: 'parity' | 'size';    // 显示模式（单双或大小）
  rule?: IntervalRule;        // 当前规则（包含 interval 和 startBlock）
  title?: string;             // 标题
  rows?: number;              // 行数（默认 6）
}
```

## 数据模型

### BlockData

```typescript
interface BlockData {
  height: number;           // 区块高度
  hash: string;             // 区块哈希
  resultValue: number;      // 结果值（0-9）
  type: 'ODD' | 'EVEN';     // 单双类型
  sizeType: 'BIG' | 'SMALL'; // 大小类型
  timestamp: string;        // 时间戳
}
```

### GridCell

```typescript
interface GridCell {
  type: 'ODD' | 'EVEN' | 'BIG' | 'SMALL' | null;  // 单元格类型
  value?: number;                                   // 结果值（0-9）
  blockHeight?: number;                             // 区块高度
}
```

### IntervalRule

```typescript
interface IntervalRule {
  id: string;               // 规则 ID
  label: string;            // 规则标签
  value: number;            // 步长
  startBlock: number;       // 起始偏移
  trendRows: number;        // 走势路行数
  beadRows: number;         // 珠盘路行数
  dragonThreshold: number;  // 长龙提醒阈值
}
```

## 正确性属性

*属性是一个特征或行为，应该在系统的所有有效执行中保持为真——本质上是关于系统应该做什么的正式陈述。属性作为人类可读规范和机器可验证正确性保证之间的桥梁。*

### 属性 1：数据过滤正确性

*对于任意* 区块数据数组、步长和起始偏移，`calculateBeadGrid` 函数返回的网格中的所有区块都应该符合规则：
- 如果步长 ≤ 1，所有区块都符合规则
- 如果步长 > 1 且起始偏移 > 0，区块高度应该 ≥ 起始偏移 且 (区块高度 - 起始偏移) % 步长 === 0
- 如果步长 > 1 且起始偏移 = 0，区块高度应该 % 步长 === 0

**验证：需求 1.1, 1.2, 1.4**

### 属性 2：填充顺序正确性

*对于任意* 区块数据数组，`calculateBeadGrid` 函数返回的网格中的每个非空单元格的位置应该符合公式：
- 列号 = Math.floor(数据索引 / 6)
- 行号 = 数据索引 % 6

其中数据索引是区块在排序后数组中的位置（从旧到新，0-based）

**验证：需求 2.1, 2.2**

### 属性 3：容量限制正确性

*对于任意* 超过 264 条的区块数据数组，`calculateBeadGrid` 函数返回的网格应该：
- 只包含最新的 264 条数据
- 最旧的数据（数组末尾）不应该出现在网格中
- 网格应该填满所有 264 个单元格（44列 × 6行）

**验证：需求 2.3**

### 属性 4：空单元格填充正确性

*对于任意* 少于 264 条的区块数据数组，`calculateBeadGrid` 函数返回的网格应该：
- 前 N 个单元格（按列优先顺序）包含数据
- 剩余的 (264 - N) 个单元格应该为空（type 为 null）

**验证：需求 2.4**

### 属性 5：按列滑动机制正确性

*对于任意* 区块数据数组，当数据从 264 条增加到 265 条或更多时：
- 如果列43已填满（6个单元格都有数据），应该删除列0的所有数据（6条）
- 新数据应该填充到列43行0
- 如果列43未填满，新数据应该填充到列43的下一个空位置

**验证：需求 2.5, 2.6**

### 属性 6：规则切换后数据正确性

*对于任意* 区块数据数组和两个不同的规则，当从规则A切换到规则B时：
- 网格应该只包含符合规则B的数据
- 如果符合规则B的数据少于 264 条，剩余位置应该为空
- 如果符合规则B的数据超过 264 条，应该只显示最新的 264 条

**验证：需求 3.2, 3.3, 3.4**

## 错误处理

### 输入验证

1. **空数据数组**：如果 `blocks` 为空数组，返回一个 44列 × rows行的空网格
2. **无效行数**：如果 `rows` 不是正整数，使用默认值 6
3. **无效步长**：如果 `interval` ≤ 0，使用默认值 1
4. **无效起始偏移**：如果 `startBlock` < 0，使用默认值 0

### 边界情况

1. **步长为 1**：所有区块都符合规则，不需要过滤
2. **数据量刚好 264 条**：填满所有单元格，不需要删除或填充空单元格
3. **数据量刚好 265 条**：触发按列滑动，删除列0的6条数据

## 测试策略

### 单元测试

单元测试用于验证特定示例、边界情况和错误条件：

1. **空数据测试**：验证空数组返回空网格
2. **步长为 1 测试**：验证所有数据都被接受
3. **边界数据量测试**：验证 264 条和 265 条数据的处理
4. **无效参数测试**：验证无效参数的默认值处理

### 属性测试

属性测试用于验证通用属性在所有输入下都成立：

1. **属性 1 测试**：生成随机区块数据、步长和起始偏移，验证过滤正确性
2. **属性 2 测试**：生成随机区块数据，验证填充顺序正确性
3. **属性 3 测试**：生成超过 264 条的随机数据，验证容量限制正确性
4. **属性 4 测试**：生成少于 264 条的随机数据，验证空单元格填充正确性
5. **属性 5 测试**：生成 264-270 条随机数据，验证按列滑动机制正确性
6. **属性 6 测试**：生成随机数据和两个随机规则，验证规则切换后数据正确性

**配置要求：**
- 每个属性测试至少运行 100 次迭代
- 使用 TypeScript 的 fast-check 库进行属性测试
- 每个测试应该标注对应的设计属性编号

**标注格式：**
```typescript
// Feature: bead-road-fix, Property 1: 数据过滤正确性
test('calculateBeadGrid filters blocks correctly', () => {
  fc.assert(
    fc.property(
      fc.array(blockDataArbitrary),
      fc.integer({ min: 1, max: 100 }),
      fc.integer({ min: 0, max: 1000 }),
      (blocks, interval, startBlock) => {
        // 测试逻辑
      }
    ),
    { numRuns: 100 }
  );
});
```

## 实现细节

### calculateBeadGrid 函数重构

**当前问题：**
1. 未使用 `interval` 和 `startBlock` 参数
2. 假设所有输入数据都已经过滤
3. 没有实现按列滑动机制

**修复方案：**

```typescript
export const calculateBeadGrid = (
  blocks: BlockData[],
  typeKey: 'type' | 'sizeType',
  rows: number = 6,
  interval: number = 1,
  startBlock: number = 0
): GridCell[][] => {
  // 1. 参数验证
  if (blocks.length === 0) {
    return Array(44).fill(null).map(() => 
      Array(rows).fill({ type: null })
    );
  }
  
  const validRows = rows > 0 ? rows : 6;
  const validInterval = interval > 0 ? interval : 1;
  const validStartBlock = startBlock >= 0 ? startBlock : 0;
  
  // 2. 数据排序（从旧到新）
  const chronological = [...blocks].sort((a, b) => a.height - b.height);
  
  // 3. 数据过滤（根据 interval 和 startBlock）
  const filtered = chronological.filter(block => {
    if (validInterval <= 1) return true;
    if (validStartBlock > 0) {
      return block.height >= validStartBlock && 
             (block.height - validStartBlock) % validInterval === 0;
    }
    return block.height % validInterval === 0;
  });
  
  // 4. 容量限制（只保留最新的 264 条）
  const maxCapacity = 44 * validRows; // 44 × 6 = 264
  const startIdx = filtered.length > maxCapacity 
    ? filtered.length - maxCapacity 
    : 0;
  const displayBlocks = filtered.slice(startIdx);
  
  // 5. 创建网格（44列 × validRows行）
  const grid: GridCell[][] = Array.from({ length: 44 }, () => 
    Array.from({ length: validRows }, () => ({ type: null }))
  );
  
  // 6. 填充网格（从左到右，从上到下）
  displayBlocks.forEach((block, idx) => {
    const col = Math.floor(idx / validRows);
    const row = idx % validRows;
    
    if (col < 44) {
      grid[col][row] = { 
        type: block[typeKey] as any, 
        value: block.resultValue,
        blockHeight: block.height
      };
    }
  });
  
  return grid;
};
```

### BeadRoad 组件更新

**当前调用：**
```typescript
const grid = useMemo(() => {
  return calculateBeadGrid(
    blocks, 
    mode === 'parity' ? 'type' : 'sizeType', 
    rows,
    rule?.value || 1,      // ✅ 已传递
    rule?.startBlock || 0  // ✅ 已传递
  );
}, [blocks, mode, rows, rule]);
```

**无需修改**：BeadRoad 组件已经正确传递了 `interval` 和 `startBlock` 参数，只需要修复 `calculateBeadGrid` 函数即可。

### App.tsx 数据过滤

**当前实现：**
App.tsx 已经在 WebSocket 层面正确过滤了数据，只保留符合当前规则的区块。这是正确的做法，因为：

1. **前端过滤**：减少内存占用，只保留需要的数据
2. **后端过滤**：通过 API 参数传递规则，后端返回过滤后的数据
3. **双重保障**：前后端都进行过滤，确保数据一致性

**无需修改**：App.tsx 的数据过滤逻辑已经正确实现。

## 性能考虑

### 时间复杂度

- **数据排序**：O(n log n)，其中 n 是区块数量
- **数据过滤**：O(n)
- **网格填充**：O(min(n, 264))
- **总体**：O(n log n)

### 空间复杂度

- **网格存储**：O(264) = O(1)，固定大小
- **临时数组**：O(n)，用于排序和过滤
- **总体**：O(n)

### 优化建议

1. **避免重复排序**：如果输入数据已经排序，可以跳过排序步骤
2. **缓存过滤结果**：如果规则未变化，可以缓存过滤后的数据
3. **增量更新**：当新区块到达时，只更新受影响的单元格，而不是重新计算整个网格

## 兼容性

### 向后兼容性

- **函数签名不变**：`calculateBeadGrid` 函数签名保持不变，只修复内部实现
- **组件接口不变**：BeadRoad 组件的属性接口保持不变
- **数据格式不变**：BlockData 和 GridCell 的数据格式保持不变

### 浏览器兼容性

- **ES6+ 语法**：使用现代 JavaScript 语法（箭头函数、解构、模板字符串等）
- **TypeScript**：需要 TypeScript 4.0+ 支持
- **React**：需要 React 16.8+ 支持（使用 Hooks）

## 部署注意事项

1. **测试覆盖率**：确保所有属性测试和单元测试都通过
2. **性能测试**：测试大数据量（1000+ 区块）的性能表现
3. **浏览器测试**：在主流浏览器（Chrome, Firefox, Safari, Edge）中测试
4. **回归测试**：确保修复没有破坏现有功能（走势路、长龙提醒等）
