# ✅ 修复完成：珠盘路 132 显示问题

## 问题总结

**现象**：
- 后端返回：341 条
- 前端使用：264 条
- 珠盘路显示：132 个格子（应该是 264 个）

**根本原因**：
`calculateBeadGrid` 函数对已过滤的数据进行了"二次过滤"，导致数据减半。

## 修复内容

### 修复1：`utils/helpers.ts` - `calculateBeadGrid` 函数

**问题**：
```typescript
// 修改前：使用 interval 重新计算索引，导致"二次过滤"
const indexedBlocks = chronological.map(b => ({
  block: b,
  idx: Math.floor((b.height - epoch) / interval)  // ❌ 错误
}));
```

**修复**：
```typescript
// 修改后：直接使用数组索引，因为数据已经是过滤后的
const indexedBlocks = chronological.map((b, i) => ({
  block: b,
  idx: i  // ✅ 正确
}));
```

**原理**：
- 前端传入的 264 条数据已经是后端按规则过滤后的结果
- 不需要再用 `interval` 计算索引
- 直接使用数组索引 `i` 即可

### 修复2：`backend/src/api.ts` - 添加调试日志

**添加**：
```typescript
console.log(`[API] 🔍 limit 参数: ${limit}, 类型: ${typeof limit}`);
console.log(`[API] ✅ 返回数据: ${resultBlocks.length} 条 (请求: ${limit} 条)`);
```

**目的**：
- 监控后端是否正确限制返回数量
- 诊断为什么返回 341 条而不是 264 条

## 测试步骤

### 1. 重启后端服务
```bash
cd backend
npm run dev
```

### 2. 刷新前端页面
按 **Ctrl+F5** 强制刷新浏览器。

### 3. 运行调试命令
在浏览器 Console 中输入：
```javascript
window.debugApp.printDebugInfo()
```

### 4. 预期结果

**前端 Console**：
```
=== 调试信息 ===
当前规则: {id: 'rule-1770364831108-1', label: '6秒', value: 2, ...}
珠盘路行数: 6
走势路行数: 6
后端返回: 264  ← 应该是 264（不是 341）
前端使用: 264
需求量: 264
===============
```

**后端 Console**：
```
[API] 📥 规则过滤请求: 步长 2, 偏移 0, 需要 264 条过滤后数据
[API] 🔍 limit 参数: 264, 类型: number
[API] 📦 加载原始数据: 30000 条
[API] 🔍 过滤后数据: 15000 条 (步长 2)
[API] ✅ 返回数据: 264 条 (请求: 264 条)
```

**珠盘路显示**：
- 应该显示 **264 个格子**（6 行 × 44 列）
- 不再是 132 个格子

## 验证方法

### 方法1：目视检查
- 打开珠盘路页面
- 数一下列数，应该是 44 列（不是 22 列）

### 方法2：Console 检查
```javascript
// 查看珠盘路数据
window.debugApp.ruleFilteredBlocks.length  // 应该是 264
```

### 方法3：React DevTools 检查
1. 安装 React DevTools 浏览器扩展
2. 打开 React DevTools
3. 选择 `BeadRoad` 组件
4. 查看 props：
   - `blocks.length` 应该是 264
   - `rows` 应该是 6
   - `grid.length` 应该是 44（列数）

## 如果问题仍然存在

### 问题A：后端仍然返回 341 条

**检查**：
1. 后端 Console 中的 `limit 参数` 是多少？
2. 前端请求 URL 是什么？

**可能原因**：
- 前端 `requiredDataCount` 不是 264
- 缓存问题

**解决**：
```javascript
// 在前端 Console 中检查
window.debugApp.requiredDataCount  // 应该是 264
```

### 问题B：珠盘路仍然只显示 132 个格子

**检查**：
1. 清除浏览器缓存（Ctrl+Shift+Delete）
2. 强制刷新（Ctrl+F5）
3. 检查 `utils/helpers.ts` 是否正确修改

**验证修改**：
```bash
# 在项目根目录运行
grep -n "idx: i" utils/helpers.ts
```

应该看到：
```
175:    idx: i  // 直接使用数组索引，避免"二次过滤"导致数据减半
```

## 后续优化

如果修复成功，可以考虑：

1. **移除不必要的参数**：
   - `calculateBeadGrid` 的 `interval` 和 `startBlock` 参数已经不需要了
   - 可以简化函数签名

2. **优化后端返回数量**：
   - 确保后端严格返回 264 条（不是 341 条）
   - 减少网络传输和内存占用

---

**修复时间**：2026-02-06
**状态**：✅ 修复完成，等待测试
**预期结果**：珠盘路显示 264 个格子（6 行 × 44 列）
