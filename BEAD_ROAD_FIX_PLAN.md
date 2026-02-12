# 珠盘路显示问题修复方案

## 📋 问题总结

通过对比副本项目（显示正常）和当前项目（显示异常），发现了以下核心问题：

### 问题 1：calculateBeadGrid 使用数组索引导致位置不稳定

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

### 问题 2：App.tsx 的数据管理与需求不符

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

### 问题 3：BeadRoad 组件的渲染逻辑

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

## 🔧 修复方案

### 方案 1：完全采用副本项目的全局索引系统（推荐）

#### 1.1 修改 calculateBeadGrid 函数

**位置**：`utils/helpers.ts`

**修改内容**：

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

**关键改进**：
1. **全局索引系统**：每个区块的位置由其高度决定，不受数组变化影响
2. **滑动窗口**：只显示最新的 44 列，自动滑动
3. **稳定性**：区块位置固定，不会跳动

---

#### 1.2 保持 App.tsx 的 264 条限制

**位置**：`App.tsx` WebSocket 消息处理部分

**当前代码**（保持不变）：

```typescript
// ✅ 按列滑动机制：当数据等于264条时，删除1列（6条），保留258条
let updated = sorted;
if (sorted.length >= MAX_BLOCKS_CAPACITY) {
  // 删除最旧的1列（6条数据）
  const deleteCount = ROWS;  // 删除6条
  updated = sorted.slice(0, sorted.length - deleteCount);
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`[WebSocket] 🔄 按列滑动: 数据达到 ${sorted.length} 条，删除最旧的 ${deleteCount} 条（1列）`);
    console.log(`[WebSocket] 🗑️ 删除区块范围: ${sorted[sorted.length - deleteCount]?.height} - ${sorted[sorted.length - 1]?.height}`);
    console.log(`[WebSocket] 📊 保留数据: ${updated.length} 条 (${updated[updated.length - 1]?.height} - ${updated[0]?.height})`);
  }
}
```

**说明**：
- 这段代码已经正确实现了 264 条限制
- 配合新的 calculateBeadGrid，可以实现稳定的显示效果

---

#### 1.3 优化 BeadRoad 组件（可选）

**位置**：`components/BeadRoad.tsx`

**当前代码**（可以保持不变）：

```typescript
// gridKey 和 columnKey 的逻辑可以保留
// 它们有助于提高渲染性能
const gridKey = useMemo(() => {
  const firstCell = grid.flat().find(cell => cell.blockHeight);
  const lastCell = [...grid.flat()].reverse().find(cell => cell.blockHeight);
  return `${firstCell?.blockHeight || 'empty'}-${lastCell?.blockHeight || 'empty'}`;
}, [grid]);
```

**说明**：
- 这些优化可以保留，不会影响修复效果
- 如果想简化代码，可以移除，使用简单的 `colIdx` 作为 key

---

## 📊 修复效果对比

### 修复前（当前项目）

```
数据变化：[136, 137, ..., 399, 400] (265条)
↓ 删除最旧的6条
数据变化：[142, 143, ..., 399, 400] (259条)

问题：
- 区块 142 原本在索引 6，删除后变成索引 0
- 导致区块从 列1行0 跳到 列0行0
- 所有区块位置都发生变化
```

### 修复后（使用全局索引）

```
数据变化：[136, 137, ..., 399, 400] (265条)
↓ 删除最旧的6条
数据变化：[142, 143, ..., 399, 400] (259条)

效果：
- 区块 142 的全局索引 = (142 - 0) / 1 = 142
- 全局列号 = 142 / 6 = 23
- 无论数组如何变化，区块 142 始终在列23
- 所有区块位置保持稳定
```

---

## 🧪 测试验证

### 测试场景 1：初始加载 264 条数据

**预期结果**：
- 显示 44 列，每列 6 行
- 最旧的数据在左侧（列0）
- 最新的数据在右侧（列43）

### 测试场景 2：新区块到达（265 条）

**预期结果**：
- 删除最旧的 6 条数据
- 保留 259 条数据
- 所有现有区块位置不变
- 新区块出现在最右侧

### 测试场景 3：连续新区块到达（259-264 条）

**预期结果**：
- 逐步填充到 264 条
- 所有区块位置保持稳定
- 自动滚动到最右侧

### 测试场景 4：再次达到 265 条

**预期结果**：
- 再次删除最旧的 6 条
- 重复场景 2 的效果

---

## 📝 实施步骤

### 步骤 1：备份当前代码

```bash
# 备份 utils/helpers.ts
cp utils/helpers.ts utils/helpers.ts.backup

# 备份 App.tsx
cp App.tsx App.tsx.backup

# 备份 components/BeadRoad.tsx
cp components/BeadRoad.tsx components/BeadRoad.tsx.backup
```

### 步骤 2：修改 calculateBeadGrid 函数

1. 打开 `utils/helpers.ts`
2. 找到 `calculateBeadGrid` 函数
3. 替换为上面提供的新实现

### 步骤 3：验证 App.tsx 的数据管理

1. 打开 `App.tsx`
2. 确认 WebSocket 消息处理部分有 264 条限制逻辑
3. 确认删除逻辑正确（删除最旧的 6 条）

### 步骤 4：构建和测试

```bash
# 构建项目
npm run build

# 启动开发服务器
npm run dev

# 启动后端服务（如果需要）
cd backend
npm run dev
```

### 步骤 5：验证修复效果

1. 打开浏览器控制台
2. 观察珠盘路显示
3. 等待新区块到达
4. 验证区块位置是否稳定

---

## 🔍 调试技巧

### 查看全局索引计算

在 `calculateBeadGrid` 中添加调试日志：

```typescript
if (process.env.NODE_ENV === 'development') {
  console.log('[BeadGrid] 全局索引计算:');
  indexedBlocks.slice(0, 5).forEach(({ block, idx }) => {
    console.log(`  区块 ${block.height}: 全局索引 ${idx}, 列 ${Math.floor(idx / validRows)}, 行 ${idx % validRows}`);
  });
}
```

### 查看窗口调整

```typescript
if (process.env.NODE_ENV === 'development') {
  console.log(`[BeadGrid] 窗口信息:`);
  console.log(`  总列数: ${totalCols}`);
  console.log(`  实际列数: ${actualCols}`);
  console.log(`  起始列索引: ${adjustedStartColIdx}`);
  console.log(`  结束列索引: ${endColIdx}`);
}
```

---

## ⚠️ 注意事项

### 1. 数据排序

- 确保数据按 height 升序排列（最旧的在前）
- 这是全局索引系统的基础

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

## 📚 参考资料

### 副本项目的关键代码

**calculateBeadGrid 函数**：
- 使用全局索引系统
- 实现滑动窗口
- 确保位置稳定

**App.tsx 数据管理**：
- 简单的容量限制（30000 条）
- 不实现按列滑动
- 让 calculateBeadGrid 处理显示逻辑

**BeadRoad 组件**：
- 简单的列索引作为 key
- 不需要复杂的 gridKey 逻辑

---

## ✅ 预期成果

修复完成后，珠盘路应该：

1. **位置稳定**：区块位置不会跳动
2. **自动滑动**：新数据到达时自动滚动到最右侧
3. **容量限制**：始终保持 264 条数据（或更少）
4. **性能良好**：渲染流畅，无卡顿

---

## 🆘 故障排除

### 问题 1：区块位置仍然跳动

**可能原因**：
- 数据排序不正确
- 全局索引计算错误

**解决方案**：
- 检查数据排序逻辑
- 添加调试日志查看全局索引

### 问题 2：显示的列数不正确

**可能原因**：
- actualCols 计算错误
- adjustedStartColIdx 计算错误

**解决方案**：
- 添加调试日志查看窗口信息
- 验证列数限制逻辑

### 问题 3：新数据不显示

**可能原因**：
- 数据过滤逻辑错误
- 全局索引超出范围

**解决方案**：
- 检查 indexedBlocks 的内容
- 验证 localCol 的计算

---

## 📞 联系支持

如果修复过程中遇到问题，请提供：

1. 控制台日志截图
2. 珠盘路显示截图
3. 当前数据量和规则信息
4. 错误信息（如果有）

---

**文档版本**：1.0  
**创建日期**：2026-02-07  
**最后更新**：2026-02-07
