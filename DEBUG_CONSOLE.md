# 🔍 Console 调试指南

## 使用方法

### 1. 刷新页面
按 `Ctrl+F5` 强制刷新页面，加载新代码。

### 2. 打开开发者工具
按 `F12` 打开浏览器开发者工具，切换到 Console 标签。

### 3. 使用调试函数

#### 方法1：快速查看所有信息
```javascript
window.debugApp.printDebugInfo()
```

**预期输出**:
```
=== 调试信息 ===
当前规则: {id: '6s', label: '6秒', value: 6, startBlock: 0, trendRows: 6, beadRows: 6, dragonThreshold: 3}
珠盘路行数: 6
走势路行数: 6
后端返回: 314
前端使用: 264
需求量: 264
===============
```

#### 方法2：单独查看各项信息
```javascript
// 查看当前规则
window.debugApp.activeRule

// 查看珠盘路行数
window.debugApp.activeRule.beadRows

// 查看数据量
window.debugApp.allBlocks.length
window.debugApp.ruleFilteredBlocks.length
window.debugApp.requiredDataCount

// 查看所有规则
window.debugApp.rules
```

## 问题诊断

### 问题1：珠盘路只显示 132 条

#### 检查珠盘路行数
```javascript
window.debugApp.activeRule.beadRows
```

**如果输出是 3**:
- 问题：珠盘路配置为 3 行 × 44 列 = 132 个格子
- 解决：修改规则配置，将 `beadRows` 改为 6

**如果输出是 6**:
- 说明配置正确，问题在其他地方

#### 检查数据量
```javascript
window.debugApp.printDebugInfo()
```

**如果输出**:
```
后端返回: 314
前端使用: 264
需求量: 264
```

说明：
- 后端返回了 314 条（应该是 264 条）
- 前端正确使用了 264 条
- 但珠盘路只显示 132 条

**可能原因**:
1. 珠盘路行数配置错误（3 行而不是 6 行）
2. 珠盘路计算逻辑有问题

### 问题2：后端返回数据量不对

#### 检查后端日志
在后端 Console 中查看：
```
[API] 📥 规则过滤请求: 步长 6, 偏移 0, 需要 264 条过滤后数据
[API] 📦 加载原始数据: 30000 条
[API] 🔍 过滤后数据: 5000 条 (步长 6)
[API] ✅ 返回数据: 314 条  ← 应该是 264 条
```

**如果返回 314 条**:
- 问题：后端没有正确限制返回数量
- 解决：检查后端 `limit` 参数处理

## 修复步骤

### 步骤1：确认问题
```javascript
window.debugApp.printDebugInfo()
```

记录输出结果。

### 步骤2：检查规则配置
```javascript
window.debugApp.activeRule
```

确认 `beadRows` 是否为 6。

### 步骤3：检查数据流
```javascript
console.log('后端返回:', window.debugApp.allBlocks.length);
console.log('前端使用:', window.debugApp.ruleFilteredBlocks.length);
console.log('需求量:', window.debugApp.requiredDataCount);
```

### 步骤4：检查珠盘路数据
打开 React DevTools，查看 BeadRoad 组件接收到的 props：
- `blocks.length` 应该是 264
- `rows` 应该是 6

## 常见问题

### Q1: window.debugApp is undefined
**A**: 刷新页面（Ctrl+F5），确保新代码已加载。

### Q2: 珠盘路行数是 6，但只显示 132 条
**A**: 可能是珠盘路计算逻辑有问题。检查 `calculateBeadGrid` 函数。

### Q3: 后端返回 314 条，应该是 264 条
**A**: 检查后端 API 的 `limit` 参数处理逻辑。

## 下一步

根据调试结果，告诉我：

1. `window.debugApp.printDebugInfo()` 的完整输出
2. 珠盘路行数是多少
3. 后端返回了多少条数据

我会根据这些信息精确定位问题并修复。

---

**创建时间**: 2026-02-06
