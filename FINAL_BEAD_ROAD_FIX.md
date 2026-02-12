# 珠盘路显示问题 - 最终修复方案

## 📋 问题总结

通过对比副本项目（显示正常）和当前项目（显示异常），发现了核心问题：

### 核心问题 1：calculateBeadGrid 使用数组索引导致位置不稳定

**当前项目的问题**：
```typescript
// ❌ 使用数组索引计算位置
displayBlocks.forEach((block, idx) => {
  const col = Math.floor(idx / validRows);  // 数组索引
  const row = idx % validRows;
});
```

**问题原因**：
- 当数据被删除后，数组索引会改变
- 例如：区块 79907539 原本在索引 5，删除前面的数据后变成索引 3
- 导致区块在网格中的位置发生跳动

**副本项目的解决方案**：
```typescript
// ✅ 使用全局索引系统（基于区块高度）
const indexedBlocks = chronological.map(b => ({
  block: b,
  idx: Math.floor((b.height - epoch) / interval)  // 全局索引
}));

// 计算位置时使用全局索引
const globalCol = Math.floor(idx / rows);
const localCol = globalCol - adjustedStartColIdx;
const localRow = idx % rows;
```

**优势**：
- 区块的位置由其高度决定，不受数组变化影响
- 即使删除旧数据，现有区块的位置保持不变
- 实现了真正的"滑动窗口"效果

---

### 核心问题 2：App.tsx 的数据管理与需求不符

**正确需求**：
- **永远保持 264 条数据**
- 初始加载：264 条
- 新数据到达：删除 1 条最旧的，添加 1 条最新的，总数仍为 264 条
- **不会出现 265 条的情况**

**当前实现的问题**：
```typescript
// ❌ 错误：允许数据达到 265 条，然后删除 6 条
if (sorted.length >= MAX_BLOCKS_CAPACITY) {
  const deleteCount = ROWS;  // 删除6条
  updated = sorted.slice(0, sorted.length - deleteCount);
}
```

**问题分析**：
1. 当前逻辑允许数据先增加到 265 条
2. 然后删除 6 条，变成 259 条
3. 这不符合"永远保持 264 条"的需求

**修复方案**：
- 修改为：当数据达到 264 条时，删除 1 条最旧的，保持 264 条
- 或者：当数据超过 264 条时，直接截取最新的 264 条
- 配合 calculateBeadGrid 的全局索引系统，实现稳定显示

---

### 核心问题 3：BeadRoad 组件的渲染逻辑

**当前实现**：
- 使用 gridKey 强制重新渲染
- 使用 columnKey 基于 blockHeight 生成稳定的 key

**问题**：
- 这些优化是为了解决位置跳动问题
- 但治标不治本，根本问题在 calculateBeadGrid

**修复方案**：
- 修复 calculateBeadGrid 后，这些优化可以保留
- 它们有助于提高渲染性能

---

## 🔧 详细修复方案

### 方案 1：修改 calculateBeadGrid 函数（采用副本项目的全局索引系统）

#### 位置：`utils/helpers.ts`

#### 核心改动说明：

**1. 数据排序（从旧到新）**
```typescript
// ✅ 关键修改 1：数据从旧到新排序
const chronological = [...blocks].sort((a, b) => a.height - b.height);
```

**2. 计算全局索引（epoch 是起始偏移）**
```typescript
// ✅ 关键修改 2：计算全局索引
const epoch = validStartBlock || 0;

// ✅ 关键修改 3：为每个区块计算全局索引
// 全局索引 = (区块高度 - 起始偏移) / 步长
const indexedBlocks = chronological.map(b => ({
  block: b,
  idx: Math.floor((b.height - epoch) / validInterval)
}));
```

**3. 确定显示窗口**
```typescript
// ✅ 关键修改 4：确定显示窗口
const firstGlobalIdx = indexedBlocks[0].idx;
const startColIdx = Math.floor(firstGlobalIdx / validRows);

const lastGlobalIdx = indexedBlocks[indexedBlocks.length - 1].idx;
const endColIdx = Math.max(startColIdx + 43, Math.floor(lastGlobalIdx / validRows));

const totalCols = endColIdx - startColIdx + 1;
```

**4. 限制最多 44 列**
```typescript
// ✅ 关键修改 5：限制最多 44 列
const maxCols = 44;
const actualCols = Math.min(totalCols, maxCols);

// ✅ 关键修改 6：如果超过 44 列，调整起始列索引，只显示最新的 44 列
const adjustedStartColIdx = totalCols > maxCols ? endColIdx - maxCols + 1 : startColIdx;
```

**5. 创建网格并使用全局索引填充**
```typescript
// ✅ 关键修改 7：创建网格
const grid: GridCell[][] = Array.from({ length: actualCols }, () => 
  Array.from({ length: validRows }, () => ({ type: null }))
);

// ✅ 关键修改 8：使用全局索引填充网格
indexedBlocks.forEach(({ block, idx }) => {
  const globalCol = Math.floor(idx / validRows);
  const localCol = globalCol - adjustedStartColIdx;
  const localRow = idx % validRows;

  if (localCol >= 0 && localCol < actualCols) {
    grid[localCol][localRow] = { 
      type: block[typeKey] as any, 
      value: block.resultValue,
      blockHeight: block.height
    };
  }
});
```

#### 完整代码实现：

```typescript
export const calculateBeadGrid = (
  blocks: BlockData[],
  typeKey: 'type' | 'sizeType',
  rows: number = 6,
  interval: number = 1,
  startBlock: number = 0
): GridCell[][] => {
  // 参数验证
  const validRows = rows > 0 ? rows : 6;
  const validInterval = interval > 0 ? interval : 1;
  const validStartBlock = startBlock >= 0 ? startBlock : 0;
  
  // 空数据处理
  if (blocks.length === 0) {
    return Array(44).fill(null).map(() => 
      Array(validRows).fill({ type: null })
    );
  }

  // ✅ 关键修改 1：数据从旧到新排序
  const chronological = [...blocks].sort((a, b) => a.height - b.height);

  // ✅ 关键修改 2：计算全局索引（epoch 是起始偏移）
  const epoch = validStartBlock || 0;
  
  // ✅ 关键修改 3：为每个区块计算全局索引
  // 全局索引 = (区块高度 - 起始偏移) / 步长
  const indexedBlocks = chronological.map(b => ({
    block: b,
    idx: Math.floor((b.height - epoch) / validInterval)
  }));

  // ✅ 关键修改 4：确定显示窗口
  const firstGlobalIdx = indexedBlocks[0].idx;
  const startColIdx = Math.floor(firstGlobalIdx / validRows);

  const lastGlobalIdx = indexedBlocks[indexedBlocks.length - 1].idx;
  const endColIdx = Math.max(startColIdx + 43, Math.floor(lastGlobalIdx / validRows));

  const totalCols = endColIdx - startColIdx + 1;

  // ✅ 关键修改 5：限制最多 44 列
  const maxCols = 44;
  const actualCols = Math.min(totalCols, maxCols);

  // ✅ 关键修改 6：如果超过 44 列，调整起始列索引，只显示最新的 44 列
  const adjustedStartColIdx = totalCols > maxCols ? endColIdx - maxCols + 1 : startColIdx;

  // ✅ 关键修改 7：创建网格
  const grid: GridCell[][] = Array.from({ length: actualCols }, () => 
    Array.from({ length: validRows }, () => ({ type: null }))
  );

  // ✅ 关键修改 8：使用全局索引填充网格
  indexedBlocks.forEach(({ block, idx }) => {
    const globalCol = Math.floor(idx / validRows);
    const localCol = globalCol - adjustedStartColIdx;
    const localRow = idx % validRows;

    if (localCol >= 0 && localCol < actualCols) {
      grid[localCol][localRow] = { 
        type: block[typeKey] as any, 
        value: block.resultValue,
        blockHeight: block.height
      };
    }
  });

  return grid;
};
```

---

### 方案 2：修改 App.tsx 的数据管理逻辑

#### 位置：`App.tsx` WebSocket 消息处理部分（第450-540行）

#### 核心改动说明：

**当前问题**：
- 允许数据达到 265 条，然后删除 6 条变成 259 条
- 不符合"永远保持 264 条"的需求

**修复方案**：
- 当数据达到 264 条时，删除 1 条最旧的，保持 264 条
- 或者：当数据超过 264 条时，直接截取最新的 264 条

#### 修复代码（方案 A：删除 1 条最旧的）：

```typescript
setAllBlocks(prev => {
  // ✅ 任务2.1: 检查是否已存在（去重）
  if (prev.some(b => b.height === block.height)) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[WebSocket] ⏭️ 跳过重复区块: ${block.height}`);
    }
    return prev;
  }
  
  // ✅ 关键修复：使用 activeRuleRef.current 获取最新的规则
  const currentRule = activeRuleRef.current;
  
  // ✅ 任务3: 验证区块是否符合规则
  if (currentRule) {
    if (currentRule.value <= 1) {
      // 所有区块都符合
    } else {
      let isAligned = false;
      if (currentRule.startBlock > 0) {
        isAligned = block.height >= currentRule.startBlock && 
                    (block.height - currentRule.startBlock) % currentRule.value === 0;
      } else {
        isAligned = block.height % currentRule.value === 0;
      }
      
      if (!isAligned) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[WebSocket] ⏭️ 跳过不符合规则的区块: ${block.height}`);
        }
        return prev;
      }
    }
  }
  
  // ✅ 修复方案 A：永远保持 264 条数据
  const MAX_BLOCKS_CAPACITY = 264;  // 固定容量：6行 × 44列 = 264
  
  // 任务2.2: 新区块添加到数组开头（索引0位置）
  const combined = [block, ...prev];
  
  // 任务2.3: 使用 Map 去重，确保唯一性（基于 height）
  const uniqueBlocks = Array.from(new Map(combined.map(b => [b.height, b])).values());
  
  // 任务2.4: 按 height 降序排列（最新的在前）
  const sorted = uniqueBlocks.sort((a, b) => b.height - a.height);
  
  // ✅ 修复：当数据超过 264 条时，只保留最新的 264 条
  let updated = sorted;
  if (sorted.length > MAX_BLOCKS_CAPACITY) {
    updated = sorted.slice(0, MAX_BLOCKS_CAPACITY);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[WebSocket] 🔄 数据超过容量: ${sorted.length} 条，截取最新的 ${MAX_BLOCKS_CAPACITY} 条`);
      console.log(`[WebSocket] 🗑️ 删除区块: ${sorted[MAX_BLOCKS_CAPACITY]?.height} - ${sorted[sorted.length - 1]?.height}`);
      console.log(`[WebSocket] 📊 保留数据: ${updated.length} 条 (${updated[updated.length - 1]?.height} - ${updated[0]?.height})`);
    }
  }
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`[WebSocket] ✅ 添加新区块: ${block.height}, 当前总数: ${updated.length}`);
  }
  
  return updated;
});
```

#### 修复代码（方案 B：按列滑动，删除 6 条）：

如果用户希望保留按列滑动的逻辑（每次删除 6 条），可以使用以下代码：

```typescript
setAllBlocks(prev => {
  // ... 前面的去重和规则验证逻辑相同 ...
  
  // ✅ 修复方案 B：按列滑动机制（每次删除 6 条）
  const MAX_BLOCKS_CAPACITY = 264;  // 固定容量：6行 × 44列 = 264
  const ROWS = 6;  // 珠盘路行数
  
  // 新区块添加到数组开头
  const combined = [block, ...prev];
  const uniqueBlocks = Array.from(new Map(combined.map(b => [b.height, b])).values());
  const sorted = uniqueBlocks.sort((a, b) => b.height - a.height);
  
  // ✅ 修复：当数据达到 264 条时，删除最旧的 6 条（1列）
  let updated = sorted;
  if (sorted.length >= MAX_BLOCKS_CAPACITY) {
    // 计算需要删除的数量，确保最终保持 264 条
    const deleteCount = sorted.length - MAX_BLOCKS_CAPACITY + ROWS;
    updated = sorted.slice(0, sorted.length - deleteCount);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[WebSocket] 🔄 按列滑动: 数据达到 ${sorted.length} 条，删除最旧的 ${deleteCount} 条`);
      console.log(`[WebSocket] 📊 保留数据: ${updated.length} 条`);
    }
  }
  
  return updated;
});
```

**推荐使用方案 A**，因为：
1. 更符合"永远保持 264 条"的需求
2. 逻辑更简单，更容易理解
3. 配合全局索引系统，实现稳定的滑动窗口效果

---

### 方案 3：优化 BeadRoad 组件（可选）

#### 位置：`components/BeadRoad.tsx`

#### 当前实现分析：

BeadRoad 组件已经实现了以下优化：

1. **gridKey**：基于第一个和最后一个非空单元格的 blockHeight 生成唯一标识符
2. **columnKey**：基于每列第一个非空单元格的 blockHeight 生成稳定的 key
3. **自动滚动**：当新数据到达时，自动滚动到最右侧

**这些优化可以保留**，因为：
- 它们有助于提高渲染性能
- 不会影响修复效果
- 与全局索引系统兼容

#### 可选优化：简化 columnKey 逻辑

如果修复 calculateBeadGrid 后，位置跳动问题已经解决，可以考虑简化 columnKey 逻辑：

```typescript
// 当前实现（复杂）
const columnKey = firstNonNullCell?.blockHeight 
  ? `col-${firstNonNullCell.blockHeight}` 
  : `empty-${colIdx}`;

// 简化版本（可选）
const columnKey = `col-${colIdx}`;
```

**建议**：先保留当前实现，验证修复效果后再考虑简化。

---

## 📊 正确的填充逻辑说明

### 关键理解：珠盘路的填充顺序

珠盘路是**按列填充**的，每列从上到下填充 6 个单元格，然后移动到下一列：

```
列0    列1    列2    列43
[0]    [6]    [12]   [258]  ← 行0（最上面）
[1]    [7]    [13]   [259]  ← 行1
[2]    [8]    [14]   [260]  ← 行2
[3]    [9]    [15]   [261]  ← 行3
[4]    [10]   [16]   [262]  ← 行4
[5]    [11]   [17]   [263]  ← 行5（最下面）
```

### 正确的新数据填充效果

**场景：当前有 264 条数据，区块 400 在最右列最下方（列43行5）**

```
当前状态（264条）：
列43
[394]  ← 行0（最上）
[395]  ← 行1
[396]  ← 行2
[397]  ← 行3
[398]  ← 行4
[400]  ← 行5（最下）✅ 区块 400 在这里
```

**新区块 401 到达后的正确效果：**

```
步骤 1：删除最旧的 1 条数据（区块 137）
步骤 2：数据变成 [138, 139, ..., 400, 401]（264条）
步骤 3：重新计算全局索引和位置

结果（264条）：
列43
[395]  ← 行0（最上）✅ 区块 401 应该在这里！
[396]  ← 行1
[397]  ← 行2
[398]  ← 行3
[399]  ← 行4
[400]  ← 行5（最下）
```

**❌ 错误的效果（当前项目的问题）：**

```
错误结果：
列43
[394]  ← 行0（最上）
[395]  ← 行1
[396]  ← 行2
[397]  ← 行3
[400]  ← 行4  ❌ 区块 400 跳到这里了
[401]  ← 行5（最下）❌ 区块 401 在最下方
```

### 为什么会出现错误？

**当前项目的问题**：
- 使用数组索引计算位置：`col = Math.floor(idx / 6)`, `row = idx % 6`
- 当删除数据后，数组索引改变，导致所有区块的位置都重新计算
- 区块 400 原本在索引 263（列43行5），删除 1 条后变成索引 262（列43行4）
- 区块 401 被添加到索引 263（列43行5）

**副本项目的解决方案**：
- 使用全局索引系统：`globalIdx = Math.floor((height - epoch) / interval)`
- 区块的位置由其高度决定，不受数组变化影响
- 区块 400 的全局索引 = (400 - 0) / 1 = 400，全局列 = 400 / 6 = 66
- 区块 401 的全局索引 = (401 - 0) / 1 = 401，全局列 = 401 / 6 = 66
- 两个区块在同一列（列66），但由于只显示最新的 44 列，它们会被映射到本地列

### 修复后的效果对比

**修复前（当前项目）**：
```
数据：[137, 138, ..., 399, 400] (264条)
新区块 401 到达
↓ 删除 1 条最旧的数据
数据：[138, 139, ..., 400, 401] (264条)

❌ 问题：
- 区块 400 从索引 263 变成索引 262
- 位置从 列43行5 跳到 列43行4
- 区块 401 在 列43行5
- 所有区块位置都发生变化
```

**修复后（使用全局索引）**：
```
数据：[137, 138, ..., 399, 400] (264条)
新区块 401 到达
↓ 删除 1 条最旧的数据
数据：[138, 139, ..., 400, 401] (264条)

✅ 效果：
- 区块 400 的全局索引 = 400，全局列 = 66，全局行 = 4
- 区块 401 的全局索引 = 401，全局列 = 66，全局行 = 5
- 由于只显示最新的 44 列，列66 被映射到本地列43
- 区块 400 在 列43行4，区块 401 在 列43行5
- 所有区块位置保持稳定
```

**等等，这还是不对！** 让我重新理解你的需求...

你说的是：**区块 401 应该在下一列的第一行（最上方）**，而不是当前列的下一行。

这意味着：
- 区块 400 在 列43行5（最右最下）
- 区块 401 应该在 列44行0（下一列的最上方）
- 但是珠盘路只有 44 列（列0-43），所以需要滑动窗口

**正确的理解**：

```
当前状态（264条，填满44列）：
列0     列1     ...  列43
[137]   [143]   ...  [395]  ← 行0
[138]   [144]   ...  [396]  ← 行1
[139]   [145]   ...  [397]  ← 行2
[140]   [146]   ...  [398]  ← 行3
[141]   [147]   ...  [399]  ← 行4
[142]   [148]   ...  [400]  ← 行5 ✅ 区块 400 在最右最下

新区块 401 到达后：
列0     列1     ...  列42    列43
[143]   [149]   ...  [395]   [401]  ← 行0 ✅ 区块 401 在最右最上！
[144]   [150]   ...  [396]   [空]   ← 行1
[145]   [151]   ...  [397]   [空]   ← 行2
[146]   [152]   ...  [398]   [空]   ← 行3
[147]   [153]   ...  [399]   [空]   ← 行4
[148]   [154]   ...  [400]   [空]   ← 行5

说明：
- 删除了列0的所有数据（区块 137-142，共6条）
- 所有列向左移动一列
- 区块 401 出现在新的列43的行0（最上方）
- 列43的其他位置为空，等待后续数据填充
```

这就是**按列滑动**的正确效果！全局索引系统可以实现这个效果。

---

## 🎯 完整示例：从 264 条到 270 条的演变

### 初始状态：264 条数据（区块 137-400）

```
列0     列1     列2     ...  列42    列43
[137]   [143]   [149]   ...  [389]   [395]  ← 行0
[138]   [144]   [150]   ...  [390]   [396]  ← 行1
[139]   [145]   [151]   ...  [391]   [397]  ← 行2
[140]   [146]   [152]   ...  [392]   [398]  ← 行3
[141]   [147]   [153]   ...  [393]   [399]  ← 行4
[142]   [148]   [154]   ...  [394]   [400]  ← 行5 ✅ 区块 400 在最右最下
```

### 第 1 次更新：区块 401 到达

```
操作：删除最旧的 1 条（区块 137），保留 264 条

列0     列1     列2     ...  列42    列43
[138]   [144]   [150]   ...  [390]   [396]  ← 行0
[139]   [145]   [151]   ...  [391]   [397]  ← 行1
[140]   [146]   [152]   ...  [392]   [398]  ← 行2
[141]   [147]   [153]   ...  [393]   [399]  ← 行3
[142]   [148]   [154]   ...  [394]   [400]  ← 行4
[143]   [149]   [155]   ...  [395]   [401]  ← 行5 ✅ 区块 401 在最右最下

说明：
- 全局索引系统确保每个区块的位置由其高度决定
- 区块 138 的全局索引 = 138，全局列 = 138/6 = 23
- 区块 401 的全局索引 = 401，全局列 = 401/6 = 66
- 显示窗口：列23-66（共44列），映射到本地列0-43
```

### 第 2-5 次更新：区块 402-405 陆续到达

每次删除 1 条最旧的数据，保留 264 条：

```
第 2 次（区块 402）：
列0     列1     ...  列43
[139]   [145]   ...  [397]  ← 行0
[140]   [146]   ...  [398]  ← 行1
[141]   [147]   ...  [399]  ← 行2
[142]   [148]   ...  [400]  ← 行3
[143]   [149]   ...  [401]  ← 行4
[144]   [150]   ...  [402]  ← 行5 ✅ 区块 402 在最右最下

第 3 次（区块 403）：
列0     列1     ...  列43
[140]   [146]   ...  [398]  ← 行0
[141]   [147]   ...  [399]  ← 行1
[142]   [148]   ...  [400]  ← 行2
[143]   [149]   ...  [401]  ← 行3
[144]   [150]   ...  [402]  ← 行4
[145]   [151]   ...  [403]  ← 行5 ✅ 区块 403 在最右最下

... 以此类推 ...

第 5 次（区块 405）：
列0     列1     ...  列43
[142]   [148]   ...  [400]  ← 行0
[143]   [149]   ...  [401]  ← 行1
[144]   [150]   ...  [402]  ← 行2
[145]   [151]   ...  [403]  ← 行3
[146]   [152]   ...  [404]  ← 行4
[147]   [153]   ...  [405]  ← 行5 ✅ 区块 405 在最右最下
```

### 第 6 次更新：区块 406 到达（触发列滑动）

```
操作：删除最旧的 1 条（区块 142），保留 264 条

列0     列1     ...  列42    列43
[143]   [149]   ...  [395]   [401]  ← 行0 ✅ 区块 401 移到最右最上！
[144]   [150]   ...  [396]   [402]  ← 行1
[145]   [151]   ...  [397]   [403]  ← 行2
[146]   [152]   ...  [398]   [404]  ← 行3
[147]   [153]   ...  [399]   [405]  ← 行4
[148]   [154]   ...  [400]   [406]  ← 行5 ✅ 区块 406 在最右最下

说明：
- 区块 401 的全局索引 = 401，全局列 = 401/6 = 66，全局行 = 401%6 = 5
- 等等，这不对！401 % 6 = 5，应该在行5，不是行0

让我重新计算...

区块 401：全局索引 = 401，全局列 = 401/6 = 66，全局行 = 401%6 = 5
区块 402：全局索引 = 402，全局列 = 402/6 = 67，全局行 = 402%6 = 0 ✅
区块 403：全局索引 = 403，全局列 = 403/6 = 67，全局行 = 403%6 = 1
区块 404：全局索引 = 404，全局列 = 404/6 = 67，全局行 = 404%6 = 2
区块 405：全局索引 = 405，全局列 = 405/6 = 67，全局行 = 405%6 = 3
区块 406：全局索引 = 406，全局列 = 406/6 = 67，全局行 = 406%6 = 4

所以正确的显示应该是：
列0     列1     ...  列42    列43
[143]   [149]   ...  [395]   [402]  ← 行0 ✅ 区块 402 在最右最上！
[144]   [150]   ...  [396]   [403]  ← 行1
[145]   [151]   ...  [397]   [404]  ← 行2
[146]   [152]   ...  [398]   [405]  ← 行3
[147]   [153]   ...  [399]   [406]  ← 行4 ✅ 区块 406 在最右倒数第二行
[148]   [154]   ...  [400]   [401]  ← 行5 ✅ 区块 401 在最右最下
```

**关键发现**：使用全局索引系统，区块的位置完全由其高度决定：
- 区块 401：全局列 66，全局行 5（401 % 6 = 5）
- 区块 402：全局列 67，全局行 0（402 % 6 = 0）✅ 新列的第一行！
- 区块 406：全局列 67，全局行 4（406 % 6 = 4）

这就是你要的效果：**当一列填满后，下一个区块自动出现在下一列的第一行（行0）**！

---

## 🧪 测试验证

### 测试场景 1：初始加载 264 条数据

**预期结果**：
- 显示 44 列，每列 6 行
- 最旧的数据在左侧（列0）
- 最新的数据在右侧（列43）
- 所有区块位置正确

### 测试场景 2：新区块到达（265 条）

**预期结果**：
- 删除最旧的 1 条数据（方案 A）或 6 条数据（方案 B）
- 保留 264 条数据
- 所有现有区块位置不变
- 新区块出现在最右侧

### 测试场景 3：连续新区块到达

**预期结果**：
- 每次新区块到达，删除最旧的数据
- 始终保持 264 条数据
- 所有区块位置保持稳定
- 自动滚动到最右侧

### 测试场景 4：切换规则

**预期结果**：
- 切换规则后，重新计算珠盘路网格
- 只显示符合新规则的数据
- 如果数据不足 264 条，用空单元格填充
- 如果数据超过 264 条，只显示最新的 264 条

---

## 🔍 调试技巧

### 查看全局索引计算

在 `calculateBeadGrid` 中添加调试日志：

```typescript
if (process.env.NODE_ENV === 'development') {
  console.log('[BeadGrid] 全局索引计算:');
  indexedBlocks.slice(0, 5).forEach(({ block, idx }) => {
    const globalCol = Math.floor(idx / validRows);
    const localCol = globalCol - adjustedStartColIdx;
    console.log(`  区块 ${block.height}: 全局索引 ${idx}, 全局列 ${globalCol}, 本地列 ${localCol}, 行 ${idx % validRows}`);
  });
  
  console.log('[BeadGrid] 窗口信息:');
  console.log(`  总列数: ${totalCols}, 实际列数: ${actualCols}`);
  console.log(`  起始列索引: ${adjustedStartColIdx}, 结束列索引: ${endColIdx}`);
}
```

### 查看数据管理

在 App.tsx 的 WebSocket 处理中添加调试日志：

```typescript
if (process.env.NODE_ENV === 'development') {
  console.log(`[WebSocket] 数据管理:`);
  console.log(`  添加前: ${prev.length} 条`);
  console.log(`  添加后: ${combined.length} 条`);
  console.log(`  去重后: ${uniqueBlocks.length} 条`);
  console.log(`  排序后: ${sorted.length} 条`);
  console.log(`  最终: ${updated.length} 条`);
}
```

---

## ⚠️ 注意事项

### 1. 数据排序

- 确保数据按 height 升序排列（最旧的在前）用于 calculateBeadGrid
- App.tsx 中的数据按 height 降序排列（最新的在前）用于显示

### 2. 步长和偏移

- 步长（interval）：每隔多少个区块采样一次
- 偏移（startBlock）：从哪个区块高度开始采样
- 全局索引 = (区块高度 - 偏移) / 步长

### 3. 列数限制

- 固定显示 44 列
- 超过 44 列时，只显示最新的 44 列
- 自动滑动窗口

### 4. 性能优化

- 全局索引计算只在数据变化时执行
- 使用 useMemo 缓存计算结果
- 避免不必要的重新渲染

---

## 📝 实施步骤

### 步骤 1：备份当前代码

```bash
# 备份 utils/helpers.ts
cp utils/helpers.ts utils/helpers.ts.backup

# 备份 App.tsx
cp App.tsx App.tsx.backup
```

### 步骤 2：修改 calculateBeadGrid 函数

1. 打开 `utils/helpers.ts`
2. 找到 `calculateBeadGrid` 函数（第158-280行）
3. 替换为上面提供的新实现

### 步骤 3：修改 App.tsx 的数据管理

1. 打开 `App.tsx`
2. 找到 WebSocket 消息处理部分（第450-540行）
3. 替换为上面提供的新实现（推荐使用方案 A）

### 步骤 4：验证 BeadRoad 组件

1. 打开 `components/BeadRoad.tsx`
2. 确认组件已经正确传递 `rule` 属性
3. 确认 `calculateBeadGrid` 调用正确

### 步骤 5：构建和测试

```bash
# 构建项目
npm run build

# 启动开发服务器
npm run dev

# 启动后端服务（如果需要）
cd backend
npm run dev
```

### 步骤 6：验证修复效果

1. 打开浏览器控制台
2. 观察珠盘路显示
3. 等待新区块到达
4. 验证区块位置是否稳定
5. 切换规则，验证数据是否正确更新

---

## ✅ 预期成果

修复完成后，珠盘路应该：

1. **位置稳定**：区块位置不会跳动
2. **自动滑动**：新数据到达时自动滚动到最右侧
3. **容量限制**：始终保持 264 条数据
4. **性能良好**：渲染流畅，无卡顿
5. **规则切换**：切换规则后立即更新显示

---

## 🆘 故障排除

### 问题 1：区块位置仍然跳动

**可能原因**：
- 数据排序不正确
- 全局索引计算错误
- epoch 或 interval 参数错误

**解决方案**：
- 检查数据排序逻辑（chronological 应该从旧到新）
- 添加调试日志查看全局索引
- 验证 epoch 和 interval 的值

### 问题 2：显示的列数不正确

**可能原因**：
- actualCols 计算错误
- adjustedStartColIdx 计算错误
- 数据量不足或超过限制

**解决方案**：
- 添加调试日志查看窗口信息
- 验证列数限制逻辑
- 检查数据量是否符合预期

### 问题 3：新数据不显示

**可能原因**：
- 数据过滤逻辑错误
- 全局索引超出范围
- localCol 计算错误

**解决方案**：
- 检查 indexedBlocks 的内容
- 验证 localCol 的计算
- 确认数据是否符合规则

### 问题 4：数据量不稳定

**可能原因**：
- App.tsx 的数据管理逻辑错误
- 删除逻辑不正确
- 容量限制未生效

**解决方案**：
- 检查 MAX_BLOCKS_CAPACITY 的值
- 验证删除逻辑（slice 的参数）
- 添加调试日志查看数据量变化

---

**文档版本**：2.0  
**创建日期**：2026-02-07  
**最后更新**：2026-02-07  
**作者**：Kiro AI Assistant
