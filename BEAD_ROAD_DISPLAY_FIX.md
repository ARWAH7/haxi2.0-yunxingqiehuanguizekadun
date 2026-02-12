# 🔧 珠盘路显示问题修复

## 问题描述

**现象**：
- 新数据从最右列的**最下行**开始填充
- 应该从最右列的**最上行**开始填充（从上到下）

## 珠盘路显示逻辑

### 正确的显示顺序

珠盘路应该按照以下顺序填充：

```
列0  列1  列2  ... 列43
[1]  [7]  [13] ... [最旧]
[2]  [8]  [14]
[3]  [9]  [15]
[4]  [10] [16]
[5]  [11] [17]
[6]  [12] [18] ... [最新]
```

- **从左到右**：时间从旧到新
- **从上到下**：每列内从旧到新
- **最新数据**：在最右列的最下行

### 当前的计算逻辑

`calculateBeadGrid` 函数：
```typescript
const chronological = [...blocks].sort((a, b) => a.height - b.height);  // 从旧到新排序
const indexedBlocks = chronological.map((b, i) => ({
  block: b,
  idx: i  // 索引 0, 1, 2, 3, ...
}));

indexedBlocks.forEach(({ block, idx }) => {
  const globalCol = Math.floor(idx / rows);  // 列号
  const localRow = idx % rows;                // 行号
  grid[localCol][localRow] = block;
});
```

**示例（6行）**：
- idx=0: col=0, row=0（第0列第0行，左上角）
- idx=1: col=0, row=1（第0列第1行）
- idx=5: col=0, row=5（第0列第5行）
- idx=6: col=1, row=0（第1列第0行）
- idx=263: col=43, row=5（第43列第5行，右下角）

**结论**：逻辑是正确的！最新数据应该在右下角。

## 可能的问题

### 问题1：数据排序错误

如果传入的 `blocks` 是**从新到旧**排序的，那么：
- idx=0 是最新数据，会显示在左上角 ❌
- idx=263 是最旧数据，会显示在右下角 ❌

**检查方法**：
```javascript
// 查看传入珠盘路的数据顺序
const blocks = window.debugApp.ruleFilteredBlocks;
console.log('第一个区块（应该是最旧）:', blocks[0]?.height);
console.log('最后一个区块（应该是最新）:', blocks[blocks.length - 1]?.height);
```

**预期结果**：
```
第一个区块（应该是最旧）: 79901350
最后一个区块（应该是最新）: 79901893
```

**如果顺序相反**：
```
第一个区块（应该是最旧）: 79901893  ← 错误！这是最新的
最后一个区块（应该是最新）: 79901350  ← 错误！这是最旧的
```

### 问题2：前端数据是从新到旧排序的

检查 `allBlocks` 的排序：
```typescript
// App.tsx 中的 WebSocket 处理
const updated = Array.from(new Map(combined.map(b => [b.height, b])).values())
  .sort((a, b) => b.height - a.height)  // ← 从新到旧排序！
  .slice(0, MAX_BLOCKS_FRONTEND);
```

**问题**：
- `allBlocks` 是从新到旧排序的（最新的在前面）
- 但 `calculateBeadGrid` 期望从旧到新排序的数据
- 导致显示顺序错误

## 解决方案

### 方案A：在 calculateBeadGrid 中反转排序（推荐）

**原理**：
- 前端数据保持从新到旧排序（方便显示最新数据）
- `calculateBeadGrid` 内部反转为从旧到新排序

**修改**：
```typescript
export const calculateBeadGrid = (
  blocks: BlockData[],
  typeKey: 'type' | 'sizeType',
  rows: number = 6,
  interval: number = 1,
  startBlock: number = 0
): GridCell[][] => {
  if (blocks.length === 0) return Array(44).fill(null).map(() => Array(rows).fill({ type: null }));

  // ✅ 修复：确保数据从旧到新排序
  const chronological = [...blocks].sort((a, b) => a.height - b.height);
  
  // ... 其余代码不变
};
```

**检查**：代码已经有这一行了！所以排序应该是正确的。

### 方案B：检查数据是否正确传入

**可能原因**：
- 传入 `BeadRoad` 的数据不是 `ruleFilteredBlocks`
- 或者数据在传入前被错误处理了

**检查 App.tsx**：
```typescript
// 查找 BeadRoad 组件的使用
<BeadRoad 
  blocks={ruleFilteredBlocks}  // ← 检查这里
  mode="parity"
  rule={activeRule}
  rows={activeRule?.beadRows || 6}
/>
```

## 诊断步骤

### 步骤1：检查数据顺序

在 Console 中运行：
```javascript
const blocks = window.debugApp.ruleFilteredBlocks;
console.log('数据量:', blocks.length);
console.log('第一个区块:', blocks[0]?.height);
console.log('最后一个区块:', blocks[blocks.length - 1]?.height);
console.log('前5个区块:', blocks.slice(0, 5).map(b => b.height));
console.log('后5个区块:', blocks.slice(-5).map(b => b.height));
```

**预期结果（从新到旧）**：
```
数据量: 264
第一个区块: 79901893  ← 最新
最后一个区块: 79901350  ← 最旧
前5个区块: [79901893, 79901892, 79901891, 79901890, 79901889]  ← 递减
后5个区块: [79901354, 79901353, 79901352, 79901351, 79901350]  ← 递减
```

### 步骤2：检查 calculateBeadGrid 的排序

在 `utils/helpers.ts` 中添加调试日志：
```typescript
export const calculateBeadGrid = (
  blocks: BlockData[],
  typeKey: 'type' | 'sizeType',
  rows: number = 6,
  interval: number = 1,
  startBlock: number = 0
): GridCell[][] => {
  if (blocks.length === 0) return Array(44).fill(null).map(() => Array(rows).fill({ type: null }));

  console.log('[BeadGrid] 输入数据:', blocks.length, '条');
  console.log('[BeadGrid] 第一个:', blocks[0]?.height, '最后一个:', blocks[blocks.length - 1]?.height);
  
  const chronological = [...blocks].sort((a, b) => a.height - b.height);
  
  console.log('[BeadGrid] 排序后第一个:', chronological[0]?.height, '最后一个:', chronological[chronological.length - 1]?.height);
  
  // ... 其余代码
};
```

### 步骤3：检查珠盘路显示

观察珠盘路：
- 最左上角的区块高度是多少？（应该是最旧的）
- 最右下角的区块高度是多少？（应该是最新的）

## 快速修复

如果确认是排序问题，可以尝试：

### 修复1：确保 chronological 排序正确

```typescript
// 确保从旧到新排序
const chronological = [...blocks].sort((a, b) => a.height - b.height);
```

### 修复2：如果需要反转显示顺序

如果你希望最新数据在左上角（而不是右下角），可以反转索引：
```typescript
const indexedBlocks = chronological.map((b, i) => ({
  block: b,
  idx: chronological.length - 1 - i  // 反转索引
}));
```

但这不是标准的珠盘路显示方式。

## 标准珠盘路显示

标准的珠盘路应该：
- **最旧数据**：左上角
- **最新数据**：右下角
- **填充顺序**：从左到右，从上到下

这样用户可以看到历史趋势的演变。

## 下一步

1. 运行诊断命令，查看数据顺序
2. 将结果告诉我
3. 我会根据结果提供精确的修复方案

---

**创建时间**：2026-02-06
**状态**：等待诊断结果
