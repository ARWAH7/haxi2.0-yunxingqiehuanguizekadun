# 🔧 修复：WebSocket 实时推送未按步长规则过滤

## 问题描述

**现象**：
- 切换到步长2、步长10等规则后
- WebSocket 推送的新区块没有按照当前规则的步长进行过滤
- 导致不符合规则的区块也被添加到前端数据中

## 根本原因

### 闭包陷阱（Closure Trap）

**位置**：`App.tsx` - WebSocket useEffect

**问题代码**：
```typescript
// WebSocket useEffect
useEffect(() => {
  const connect = () => {
    ws.onmessage = (event) => {
      // 使用闭包捕获的 rules 和 activeRuleId
      const currentRule = rules.find(r => r.id === activeRuleId);  // ❌ 错误！
      // ...
    };
  };
  connect();
}, []);  // ← 空依赖数组
```

**问题分析**：
1. WebSocket useEffect 的依赖数组是空的（`[]`）
2. 这意味着 `ws.onmessage` 回调函数只创建一次
3. 回调函数中的 `rules` 和 `activeRuleId` 是**闭包捕获的初始值**
4. 当用户切换规则时，`activeRuleId` 更新了，但 `ws.onmessage` 中的值还是旧的
5. 结果：WebSocket 始终使用初始规则（步长1）进行过滤

**举例说明**：
```typescript
// 初始状态：activeRuleId = '1' (步长1)
useEffect(() => {
  ws.onmessage = (event) => {
    // 闭包捕获：activeRuleId = '1'
    const currentRule = rules.find(r => r.id === activeRuleId);
    // currentRule.value = 1
  };
}, []);

// 用户切换到步长2
setActiveRuleId('2');  // activeRuleId 更新为 '2'

// 但 ws.onmessage 中的 activeRuleId 还是 '1' ❌
// 因为 ws.onmessage 只创建了一次，闭包捕获的是初始值
```

## 解决方案

### 使用 useRef 存储最新规则

**原理**：
- `useRef` 创建的引用在组件整个生命周期中保持不变
- 修改 `ref.current` 不会触发重新渲染
- 回调函数可以通过 `ref.current` 访问到最新的值

**实现**：

#### 步骤1：创建 activeRuleRef
```typescript
const activeRuleRef = useRef<IntervalRule | undefined>(undefined);
```

#### 步骤2：更新 activeRuleRef
```typescript
useEffect(() => {
  activeRuleRef.current = activeRule;
}, [activeRule]);
```

#### 步骤3：在 WebSocket 中使用 activeRuleRef
```typescript
ws.onmessage = (event) => {
  // 使用 activeRuleRef.current 获取最新的规则
  const currentRule = activeRuleRef.current;  // ✅ 正确！
  if (currentRule && currentRule.value > 1) {
    // 过滤逻辑
  }
};
```

## 修复内容

### 修复1：添加 activeRuleRef

**文件**：`App.tsx`

**位置**：useRef 声明区域

**代码**：
```typescript
const blocksRef = useRef<BlockData[]>([]);
const isPollingBusy = useRef(false);
const navRef = useRef<HTMLDivElement>(null);
const activeRuleRef = useRef<IntervalRule | undefined>(undefined);  // ✅ 新增
```

### 修复2：更新 activeRuleRef

**文件**：`App.tsx`

**位置**：activeRule useMemo 之后

**代码**：
```typescript
const activeRule = useMemo(() => 
  rules.find(r => r.id === activeRuleId) || rules[0]
, [rules, activeRuleId]);

// ✅ 新增：更新 activeRuleRef
useEffect(() => {
  activeRuleRef.current = activeRule;
}, [activeRule]);
```

### 修复3：WebSocket 使用 activeRuleRef

**文件**：`App.tsx`

**位置**：WebSocket onmessage 处理函数

**修改前**：
```typescript
const currentRule = rules.find(r => r.id === activeRuleId);  // ❌ 闭包陷阱
```

**修改后**：
```typescript
const currentRule = activeRuleRef.current;  // ✅ 获取最新规则
```

**完整代码**：
```typescript
ws.onmessage = (event) => {
  const block = data;
  
  setAllBlocks(prev => {
    // 使用 activeRuleRef.current 获取最新的规则
    const currentRule = activeRuleRef.current;
    if (currentRule && currentRule.value > 1) {
      const startBlock = currentRule.startBlock || 0;
      const isAligned = startBlock > 0
        ? block.height >= startBlock && (block.height - startBlock) % currentRule.value === 0
        : block.height % currentRule.value === 0;
      
      if (!isAligned) {
        console.log(`[WebSocket] ⏭️ 跳过不符合规则 ${currentRule.label} (步长 ${currentRule.value}) 的区块: ${block.height}`);
        return prev;
      }
    }
    
    // 添加符合规则的新区块
    const combined = [block, ...prev];
    // ...
  });
};
```

## 测试步骤

### 1. 刷新页面
按 **Ctrl+F5** 强制刷新浏览器。

### 2. 切换到步长2规则
1. 切换到 "6秒（步长2）" 规则
2. 等待 WebSocket 推送新区块
3. 查看 Console 日志

### 3. 验证过滤逻辑

#### 预期日志（步长2）：
```
[Redis WS] 📦 新区块: 100 (EVEN, BIG)
[WebSocket] ✅ 添加符合规则 6秒 (步长 2) 的新区块: 100, 当前总数: 264

[Redis WS] 📦 新区块: 101 (ODD, BIG)
[WebSocket] ⏭️ 跳过不符合规则 6秒 (步长 2) 的区块: 101  ← 跳过奇数区块

[Redis WS] 📦 新区块: 102 (EVEN, BIG)
[WebSocket] ✅ 添加符合规则 6秒 (步长 2) 的新区块: 102, 当前总数: 264
```

#### 预期日志（步长10）：
```
[Redis WS] 📦 新区块: 100 (EVEN, BIG)
[WebSocket] ✅ 添加符合规则 30秒 (步长 10) 的新区块: 100, 当前总数: 264

[Redis WS] 📦 新区块: 101 (ODD, BIG)
[WebSocket] ⏭️ 跳过不符合规则 30秒 (步长 10) 的区块: 101

[Redis WS] 📦 新区块: 102 (EVEN, BIG)
[WebSocket] ⏭️ 跳过不符合规则 30秒 (步长 10) 的区块: 102

...

[Redis WS] 📦 新区块: 110 (EVEN, BIG)
[WebSocket] ✅ 添加符合规则 30秒 (步长 10) 的新区块: 110, 当前总数: 264
```

### 4. 验证数据正确性

```javascript
// 查看最新的5个区块高度
window.debugApp.allBlocks.slice(0, 5).map(b => b.height)

// 步长1：应该连续
// [105, 104, 103, 102, 101]

// 步长2：应该间隔2
// [106, 104, 102, 100, 98]

// 步长10：应该间隔10
// [110, 100, 90, 80, 70]
```

## 技术细节

### 为什么不能添加依赖？

**问题**：为什么不能把 `rules` 和 `activeRuleId` 添加到 WebSocket useEffect 的依赖数组？

**答案**：
- 如果添加依赖，每次规则切换时，WebSocket 会断开并重新连接
- 这会导致：
  1. 频繁的连接/断开，增加服务器负担
  2. 可能丢失实时数据
  3. 用户体验不好（连接状态频繁变化）

**正确做法**：
- WebSocket 连接保持不变（依赖数组为空）
- 使用 `useRef` 让回调函数访问最新的规则
- 这样既保持连接稳定，又能正确过滤数据

### useRef vs useState

**为什么用 useRef 而不是 useState？**

| 特性 | useRef | useState |
|------|--------|----------|
| 更新触发渲染 | ❌ 不触发 | ✅ 触发 |
| 值的持久性 | ✅ 持久 | ✅ 持久 |
| 回调中访问最新值 | ✅ 可以 | ❌ 闭包陷阱 |
| 适用场景 | 存储可变值 | 存储状态 |

**结论**：
- `activeRule` 已经是 state（通过 `activeRuleId` 计算）
- 不需要再用 `useState` 存储
- 只需要用 `useRef` 让 WebSocket 回调访问最新值

## 预期结果

### 步长1（3秒）
- 所有区块都添加
- 区块高度连续：100, 99, 98, 97, ...

### 步长2（6秒）
- 只添加偶数高度的区块
- 区块高度间隔2：100, 98, 96, 94, ...

### 步长10（30秒）
- 只添加高度能被10整除的区块
- 区块高度间隔10：100, 90, 80, 70, ...

### 步长100（5分钟）
- 只添加高度能被100整除的区块
- 区块高度间隔100：1000, 900, 800, 700, ...

## 如果问题仍然存在

### 检查1：Console 日志
WebSocket 推送新区块时，是否看到正确的步长？

**查看日志**：
```
[WebSocket] ⏭️ 跳过不符合规则 6秒 (步长 2) 的区块: 101
```

**如果步长始终是1**：
- `activeRuleRef` 没有正确更新
- 检查 `useEffect(() => { activeRuleRef.current = activeRule; }, [activeRule]);`

### 检查2：验证 activeRuleRef
```javascript
// 在 Console 中检查
window.debugApp.activeRule
// 应该显示当前规则

// 切换规则后再检查
window.debugApp.activeRule
// 应该显示新规则
```

### 检查3：清除缓存
1. 按 Ctrl+Shift+Delete 清除浏览器缓存
2. 按 Ctrl+F5 强制刷新页面
3. 重新测试

---

**修复时间**：2026-02-06
**状态**：✅ 修复完成，等待测试
**预期结果**：WebSocket 推送的新区块按照当前规则的步长进行过滤
