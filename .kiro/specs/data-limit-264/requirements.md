# 需求文档

## 简介

本功能旨在优化数据存储和内存管理，确保每个采样规则只保留最新的264条符合规则的区块数据。当新数据到来时，自动删除最旧的数据，始终维持固定的数据量，防止内存无限增长。

## 术语表

- **System**: 前端数据管理系统
- **Rule**: 采样规则，定义区块过滤的步长（interval）和起始偏移（startBlock）
- **Block**: 区块数据，包含高度（height）、哈希（hash）、结果值等信息
- **AllBlocks**: 全局状态中存储的所有区块数据数组
- **BeadGrid**: 珠盘路网格，固定为 6 行 × 44 列 = 264 个单元格
- **符合规则的区块**: 满足当前规则步长和偏移条件的区块

## 需求

### 需求 1: 固定数据容量限制

**用户故事:** 作为系统管理员，我希望每个规则只保留固定数量的最新数据，以便控制内存使用并提高性能。

#### 验收标准

1. THE System SHALL 为每个规则维护最多 264 条符合规则的区块数据
2. WHEN 符合规则的区块数据超过 264 条 THEN THE System SHALL 自动删除最旧的数据
3. WHEN 新的符合规则的区块到达 THEN THE System SHALL 将其添加到数据集的开头（最新位置）
4. THE System SHALL 确保 allBlocks 数组始终按区块高度降序排列（最新的在前）

### 需求 2: WebSocket 实时数据处理

**用户故事:** 作为用户，我希望实时接收的新区块能够正确过滤和限制，以便始终看到最新的264条数据。

#### 验收标准

1. WHEN WebSocket 接收到新区块 THEN THE System SHALL 检查该区块是否符合当前激活规则
2. WHEN 新区块符合规则 THEN THE System SHALL 将其添加到 allBlocks 数组
3. WHEN 添加新区块后数据量超过 264 条 THEN THE System SHALL 删除最旧的区块
4. WHEN 新区块不符合规则 THEN THE System SHALL 跳过该区块，不添加到 allBlocks


