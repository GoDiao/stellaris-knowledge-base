# Stellaris Knowledge Base — 设计文档

## 概述

为 Paradox Interactive 的太空大战略游戏《群星》(Stellaris) 构建一个背景设定知识库。目标受众包括：玩家、内容创作者、AI 开发者。要求兼顾人类浏览体验和 AI 可读性，全部静态部署，零成本运行。

## 技术方案

**Astro + YAML 数据层 + SQLite 查询层**，部署在 GitHub Pages。

- **YAML 源数据**：每个实体一个 YAML 文件，Git 可追踪、人可编辑、AI 可直读
- **Astro 静态站点**：构建时从 YAML 渲染页面，支持 Markdown + 组件混写
- **SQLite 查询层**：构建时从 YAML 同步生成，用于复杂关系查询
- **D3.js 知识图谱**：从关系数据生成 `graph.json`，前端渲染交互式力导向图
- **Pagefind 全站搜索**：纯静态搜索，构建时生成索引

### 部署（零成本）

| 组件 | 部署位置 | 费用 |
|------|---------|------|
| 文档站点 + 知识图谱 | GitHub Pages | 免费 |
| 静态 JSON API | GitHub Pages | 免费 |
| Pagefind 搜索 | GitHub Pages（内嵌） | 免费 |
| SQLite 数据库文件 | GitHub Pages（下载） | 免费 |
| YAML 源数据 | GitHub 仓库 | 免费 |

## 数据模型

### 实体分类（6 大类）

| 分类 | 内容 | 颜色标识 |
|------|------|---------|
| 政权与阵营 | 帝国、堕落帝国、联邦、派系 | 紫色 |
| 危机与威胁 | 三大危机、利维坦、虚空之灾 | 蓝色 |
| 叙事与事件 | 事件链、考古遗址、异常点 | 绿色 |
| 灵能与超自然 | 虚境、灵能实体、契约 | 橙色 |
| 科技与建筑 | 巨构、科技树、遗迹 | 红色 |
| 种族与生物 | 物种特质、预设种族、传记 | 粉色 |

### YAML 实体格式

每个实体一个 YAML 文件，存放在 `data/entities/{category}/` 下。

```yaml
id: fallen_empire_militant_isolationist
name:
  en: Militant Isolationists
  zh: 军事孤立者
category: empire
subcategory: fallen_empire
dlc: null
lore: >
  古老而强大的帝国，极端排外。任何在其边境建立殖民地的行为
  都将招致毁灭性的报复。他们守卫着远古的遗迹和科技。
traits:
  - xenophobe_fanatic
  - militarist
relations:
  - target: fallen_empire_holy_guardians
    type: rival
    description: 教义对立
  - target: crisis_prethoryn_scourge
    type: reacts_to
    description: 虫灾唤醒时会苏醒参战
trigger_conditions:
  - description: 在其边境殖民
    action: 最后通牒 → 战争
  - description: 拒绝其要求
    action: 立即开战
awakening:
  type: guardian_awakening
  trigger: 银河危机爆发
  becomes: awakened_ascendancy
tags: [fallen_empire, xenophobe, militarist, awakening, guardian]
```

### 关系类型

`relates_to` | `triggers` | `belongs_to` | `evolves_into` | `rival_of` | `ally_of` | `contains` | `references`

构建时从所有 YAML 的 `relations` 字段提取，生成 `/api/graph.json` 供 D3.js 渲染。

## 站点页面结构

### 5 个主入口

1. **首页** — 总览 + Pagefind 搜索框 + 统计数据
2. **百科** — 6 大分类浏览，支持按分类/DLC/标签筛选
3. **知识图谱** — D3.js 力导向图，支持分类和 DLC 筛选
4. **时间线** — 按银河历史叙事排列事件
5. **API 文档** — 说明 AI 如何通过各通道读取数据

### 实体详情页

- 左侧：标签 + 双语名称 + 描述 + 触发条件
- 右侧：关联实体列表 + 局部图谱缩略
- 底部：JSON-LD 结构化数据

## 数据来源与爬取

### 游戏文件数据（本地，约 80%）

来源：`D:/Games/Stellaris Astral Planes/`

| 目录 | 内容 |
|------|------|
| `localisation/simp_chinese/` | 108 个中文文本文件 |
| `localisation/english/` | 108 个英文原文文件 |
| `common/` | 142 个子目录的结构化数据 |
| `prescripted_countries/` | 预设帝国定义 |
| `events/` | 事件链脚本 |

### 爬取流水线（6 步）

1. 解析 localisation → 术语表
2. 解析 common/ + prescripted_countries/ → 实体结构
3. 解析 events/ → 事件链关系
4. 合并 1+2+3 → 完整 YAML 实体
5. 爬取 Wiki → 补充 lore 字段
6. 人工校对关系

## AI 读取通道

1. **YAML 源文件** — 直接读 GitHub 仓库
2. **静态 JSON API** — GitHub Pages 上的 JSON 文件
3. **页面 JSON-LD** — 每页嵌入结构化数据
4. **SQLite 下载** — 本地 SQL 查询

## 项目目录

```
Stellaris/
├── data/entities/{category}/
├── scripts/ (parsers, builders)
├── src/ (Astro site)
├── public/api/ (static JSON)
└── .github/workflows/
```
