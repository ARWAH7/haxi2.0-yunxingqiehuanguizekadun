# 🔧 修复：珠盘路只显示 132 条问题

## 问题分析

### 现象
- 后端返回：314 条数据
- 前端使用：264 条数据
- 珠盘路显示：132 条数据（264 的一半）

### 可能原因

#### 原因1：珠盘路行数配置错误
- 珠盘路配置：3 行 × 44 列 = 132 个格子
- 应该配置：6 行 × 44 列 = 264 个格子

#### 原因2：后端返回数据量不对
- 请求：264 条
- 返回：314 条
- 说明后端没有正确限制返回数量

#### 原因3：前端数据被重复过滤
- WebSocket 实时数据过滤
- 导致数据量减半

## 解决方案

### 方案1：检查珠盘路行数配置

查看当前规则的 `beadRows` 配置：

```typescript
// 应该是 6 行
{ id: '6s', label: '6秒', value: 6, startBlock: 0, trendRows: 6, beadRows: 6, dragonThreshold: 3 }
```

如果是 3 行，修改为 6 行：

```typescript
{ id: '6s', label: '6秒', value: 6, startBlock: 0, trendRows: 6, beadRows: 6, dragonThreshold: 3 }
```

### 方案2：检查后端返回数据

后端应该返回 264 条，但实际返回了 314 条。

检查后端日志：
```
[API] 📥 规则过滤请求: 步长 6, 偏移 0, 需要 264 条过滤后数据
[API] 📦 加载原始数据: 30000 条
[API] 🔍 过滤后数据: ??? 条 (步长 6)
[API] ✅ 返回数据: 314 条  ← 应该是 264 条
```

如果返回 314 条，说明 `limit` 参数没有生效。

### 方案3：检查前端数据处理

前端日志显示：
```
[前端] 规则: 6秒, 后端已过滤数据: 314 条, 使用: 264 条
```

这说明：
- `allBlocks.length` = 314 条
- `ruleFilteredBlocks.length` = 264 条

但珠盘路只显示 132 条，说明珠盘路的计算有问题。

## 调试步骤

### 步骤1：检查规则配置

打开浏览器开发者工具（F12）→ Console，输入：

```javascript
// 查看当前规则
console.log(activeRule);
```

预期输出：
```javascript
{
  id: '6s',
  label: '6秒',
  value: 6,
  startBlock: 0,
  trendRows: 6,
  beadRows: 6,  ← 应该是 6，不是 3
  dragonThreshold: 3
}
```

### 步骤2：检查数据量

在 Console 输入：

```javascript
// 查看数据量
console.log('allBlocks:', allBlocks.length);
console.log('ruleFilteredBlocks:', ruleFilteredBlocks.length);
console.log('requiredDataCount:', requiredDataCount);
```

预期输出：
```
allBlocks: 264
ruleFilteredBlocks: 264
requiredDataCount: 264
```

### 步骤3：检查珠盘路数据

在 Console 输入：

```javascript
// 查看珠盘路接收到的数据
console.log('BeadRoad blocks:', ruleFilteredBlocks.length);
```

预期输出：
```
BeadRoad blocks: 264
```

## 快速修复

### 修复1：确保后端返回 264 条

后端代码已经正确，但需要确认 `limit` 参数传递正确。

前端请求：
```typescript
`${BACKEND_API_URL}/api/blocks?limit=${requiredDataCount}&ruleValue=${ruleValue}&startBlock=${startBlock}`
```

其中 `requiredDataCount` 应该是 264。

### 修复2：确保珠盘路配置正确

检查规则配置，确保 `beadRows: 6`。

如果是 3，修改为 6：

```typescript
const DEFAULT_RULES: IntervalRule[] = [
  { id: '6s', label: '6秒', value: 6, startBlock: 0, trendRows: 6, beadRows: 6, dragonThreshold: 3 },
];
```

### 修复3：清除缓存

1. 按 Ctrl+Shift+Delete 清除浏览器缓存
2. 按 Ctrl+F5 强制刷新页面
3. 重新测试

## 预期结果

修复后应该看到：

```
[API] 📥 规则过滤请求: 步长 6, 偏移 0, 需要 264 条过滤后数据
[API] 📦 加载原始数据: 30000 条
[API] 🔍 过滤后数据: 5000 条 (步长 6)
[API] ✅ 返回数据: 264 条
[前端] 规则: 6秒, 后端已过滤数据: 264 条, 使用: 264 条
```

珠盘路应该显示 264 个格子（6 行 × 44 列）。

---

**修复时间**：2026-02-06
