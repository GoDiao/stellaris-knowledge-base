---
layout: ../layouts/BaseLayout.astro
title: API 文档
---

# AI 数据接口

群星知识库提供四条零成本的 AI 读取通道，全部基于静态文件，无需服务器。

---

## 01 YAML 源文件

直接读取 GitHub 仓库中的 YAML 实体文件。最适合离线使用、批量分析和 RAG 向量索引。

**路径格式**

```
data/entities/CATEGORY/ID.yml
```

**Python 示例**

```python
import yaml, requests

url = "https://godiao.github.io/stellaris-knowledge-base/data/entities/empires/tzynn.yml"
data = yaml.safe_load(requests.get(url).text)
print(data["name"]["zh"])  # 奇恩帝国
```

---

## 02 静态 JSON API

构建时生成的 JSON 索引文件，部署在 GitHub Pages 上。适合在线精准查询。

**端点列表**

```
GET /api/index.json         # 全部实体摘要
GET /api/empires.json       # 分类列表
GET /api/graph.json         # 知识图谱数据
GET /api/entity/ID.json     # 单实体详情
```

---

## 03 页面 JSON-LD

每个实体详情页嵌入 schema.org 结构化数据。通用 AI 工具和搜索引擎可直接识别。

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "name": "军事孤立者",
  "alternateName": "Militant Isolationists"
}
</script>
```

---

## 04 SQLite 数据库下载

下载完整数据库文件，在本地执行复杂关系查询。

**下载地址**

```
https://godiao.github.io/stellaris-knowledge-base/stellaris_kb.db
```

**SQL 示例**

```sql
SELECT e.name_zh, r.type, t.name_zh as target
FROM entities e
JOIN relations r ON e.id = r.source_id
JOIN entities t ON r.target_id = t.id
WHERE e.category = 'crisis';
```
