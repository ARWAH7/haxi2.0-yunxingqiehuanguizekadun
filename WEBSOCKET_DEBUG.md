# 🔍 WebSocket 过滤问题诊断

## 观察到的问题

从日志来看：
```
[Redis WS] 📦 新区块: 79901737 (EVEN, SMALL)
[WebSocket] ✅ 添加符合规则的新区块: 79901737, 当前总数: 271

[Redis WS] 📦 新区块: 79901738 (ODD, BIG)
[WebSocket] ✅ 添加符合规则的新区块: 79901738, 当前总数: 272

[Redis WS] 📦 新区块: 79901739 (EVEN, BIG)
[WebSocket] ✅ 添加符合规则的新区块: 79901739, 当前总数: 273

[Redis WS] 📦 新区块: 79901740 (EVEN, SMALL)
[WebSocket] ✅ 添加符合规则的新区块: 79901740, 当前总数: 274
```

**问题**：
- 规则是 "6秒"（应该是步长2）
- 但所有区块都被添加了：79901737, 79901738, 79901739, 79901740（连续）
- 应该只添加偶数高度：79901738, 79901740
- 应该跳过奇数高度：79901737, 79901739

## 可能的原因

### 原因1：activeRuleRef.current 是 undefined
如果 `activeRuleRef.current` 是 `undefined`，那么过滤逻辑不会执行：
```typescript
if (currentRule && currentRule.value > 1) {
  // 过滤逻辑
}
// 如果 currentRule 是 undefined，直接跳过过滤，添加所有区块
```

### 原因2：规则的 value 不是 2
如果规则的 `value` 是 1，那么过滤逻辑也不会执行：
```typescript
if (currentRule && currentRule.value > 1) {
  // 如果 value = 1，条件不满足，跳过过滤
}
```

### 原因3：规则名称和步长不匹配
可能规则名称是 "6秒"，但 `value` 实际上是 1。

## 诊断步骤

### 步骤1：检查当前规则
在 Console 中运行：
```javascript
window.debugApp.activeRule
```

**预期输出**：
```javascript
{
  id: 'rule-1770364831108-1',
  label: '6秒',
  value: 2,  // ← 应该是 2
  startBlock: 0,
  trendRows: 6,
  beadRows: 6,
  dragonThreshold: 3
}
```

**如果 value 不是 2**：
- 规则配置错误
- 需要修改规则配置

### 步骤2：检查 activeRuleRef
由于 `activeRuleRef` 不在 `window.debugApp` 中，我们需要添加它。

**临时解决方案**：
在 Console 中运行：
```javascript
// 查看所有规则
window.debugApp.rules

// 查看当前激活的规则ID
window.debugApp.activeRuleId

// 查看当前规则
window.debugApp.activeRule
```

### 步骤3：查看新的调试日志
刷新页面后，等待 WebSocket 推送新区块，查看新的调试日志：
```
[WebSocket] 🔍 当前规则: 6秒, 步长: 2, 偏移: 0
[WebSocket] 🔍 区块 79901741 是否符合规则: false (79901741 % 2 = 1)
[WebSocket] ⏭️ 跳过不符合规则 6秒 (步长 2) 的区块: 79901741
```

## 修复方案

### 方案A：如果 activeRuleRef.current 是 undefined

**原因**：`activeRuleRef` 没有正确初始化。

**修复**：
```typescript
// 在 activeRuleRef 声明时初始化
const activeRuleRef = useRef<IntervalRule | undefined>(activeRule);

// 或者在 useEffect 中初始化
useEffect(() => {
  activeRuleRef.current = activeRule;
}, [activeRule]);
```

### 方案B：如果规则的 value 不是 2

**原因**：规则配置错误。

**修复**：
1. 打开设置面板
2. 找到 "6秒" 规则
3. 编辑规则，确保 "区块步长" 是 2
4. 保存

### 方案C：如果规则名称和步长不匹配

**原因**：规则名称是 "6秒"，但 `value` 是 1。

**修复**：
1. 重命名规则为 "3秒"（如果 value 是 1）
2. 或者修改 value 为 2（如果想保持 "6秒" 名称）

## 快速测试

### 测试1：手动验证过滤逻辑
在 Console 中运行：
```javascript
// 获取当前规则
const rule = window.debugApp.activeRule;
console.log('规则:', rule.label, '步长:', rule.value);

// 测试几个区块高度
const testHeights = [79901737, 79901738, 79901739, 79901740];
testHeights.forEach(height => {
  const isAligned = height % rule.value === 0;
  console.log(`区块 ${height}: ${isAligned ? '✅ 符合' : '❌ 不符合'} (${height} % ${rule.value} = ${height % rule.value})`);
});
```

**预期输出（步长2）**：
```
规则: 6秒 步长: 2
区块 79901737: ❌ 不符合 (79901737 % 2 = 1)
区块 79901738: ✅ 符合 (79901738 % 2 = 0)
区块 79901739: ❌ 不符合 (79901739 % 2 = 1)
区块 79901740: ✅ 符合 (79901740 % 2 = 0)
```

### 测试2：验证 activeRuleRef
添加到 `window.debugApp`：

**修改 App.tsx**：
```typescript
useEffect(() => {
  if (typeof window !== 'undefined') {
    (window as any).debugApp = {
      activeRule,
      activeRuleRef,  // ← 添加这一行
      allBlocks,
      ruleFilteredBlocks,
      requiredDataCount,
      rules,
      activeRuleId,
      printDebugInfo: () => {
        console.log('=== 调试信息 ===');
        console.log('当前规则:', activeRule);
        console.log('activeRuleRef.current:', activeRuleRef.current);  // ← 添加这一行
        console.log('珠盘路行数:', activeRule?.beadRows);
        console.log('走势路行数:', activeRule?.trendRows);
        console.log('后端返回:', allBlocks.length);
        console.log('前端使用:', ruleFilteredBlocks.length);
        console.log('需求量:', requiredDataCount);
        console.log('===============');
      }
    };
  }
}, [activeRule, allBlocks, ruleFilteredBlocks, requiredDataCount, rules, activeRuleId]);
```

然后在 Console 中运行：
```javascript
window.debugApp.printDebugInfo()
```

查看 `activeRuleRef.current` 是否和 `activeRule` 一致。

## 下一步

1. **刷新页面**（Ctrl+F5）
2. **运行诊断命令**：
   ```javascript
   window.debugApp.printDebugInfo()
   ```
3. **查看新的调试日志**（等待 WebSocket 推送新区块）
4. **将结果告诉我**，包括：
   - `window.debugApp.activeRule` 的完整输出
   - WebSocket 的新调试日志
   - 手动验证过滤逻辑的结果

---

**创建时间**：2026-02-06
**状态**：等待诊断结果
