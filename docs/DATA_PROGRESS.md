# 群星知识库数据填充进度

> 最后更新：2026-04-25 22:30

## 总体统计

| 指标 | 数值 |
|------|------|
| 实体总数 | 1,361 |
| 静态页面 | 1,371 |
| 图谱节点 | 1,361 |
| 图谱关系边 | 6,785 |
| 术语表条目 | ~69,000 |

---

## 分类进度

### empires（政权与阵营）✅ 完成
- **来源**：`prescripted_countries/` 游戏文件
- **数量**：36 个预设帝国
- **字段完整度**：name ✅, species ✅, authority ✅, civics ✅, ethics ✅, origin ✅, lore ⚠️(短), relations ✅
- **备注**：基础数据完整，lore 待 Wiki 补充叙事

### events（叙事与事件）✅ 完成
- **来源**：`anomalies/` + `archaeological_site_types/` 游戏文件
- **数量**：343 个（异常点 + 考古遗址）
- **字段完整度**：id ✅, name ✅, category ✅, subcategory ✅, spawn_chance ✅, on_success/on_fail ✅, lore ⚠️(游戏内简短描述), relations ✅
- **备注**：覆盖了绝大部分探索内容

### technology（科技与建筑）✅ 完成
- **来源**：`technology/` 游戏文件（25 个 txt 文件）
- **数量**：484 个科技节点
- **字段完整度**：id ✅, name ✅, area ✅, tier ✅, cost ✅, prerequisites ✅, category ✅, features ✅, weight ✅
- **备注**：包含前置依赖链、科技领域分类、是否可重复研究标记
- **脚本**：`scripts/parse-technology.mjs`

### species（种族与生物）✅ 完成
- **来源**：`species_classes/` + `traits/` 游戏文件
- **数量**：274 个（物种类型 + 物种特质）
- **字段完整度**：id ✅, name ✅, archetype ✅, cost ✅, modifiers ✅, archetypes ✅
- **备注**：包含所有物种特质（正面/负面/中性）、种族类型（哺乳类/爬行类等）
- **脚本**：`scripts/parse-species.mjs`

### crises（危机与威胁）✅ 完成
- **来源**：`crisis_events_1/2/3.txt` + `nemesis_crisis_*.txt` 事件文件
- **数量**：443 个（三大危机 + 成为危机 事件链）
- **字段完整度**：id ✅, name ✅, lore ✅, events ✅, options ✅, picture ✅
- **备注**：虫灾(63 可见事件) + 肃正(127) + 高维恶魔(184) + 成为危机(60) + 触发事件(3)
- **脚本**：`scripts/parse-crisis.mjs`

### psionic（灵能与超自然）❌ 未开始
- **来源**：`shroud/` 等事件文件、Wiki 补充
- **数量**：0
- **计划**：虚境实体、灵能契约、终焉之轮回
- **阻塞**：主要靠叙事文本，游戏文件结构不统一

---

## 关系图谱

- **节点**：1,361（全部实体）
- **边**：6,785
- **生成方式**：自动（标签关联 4,378 + lore 提及 322）
- **质量**：⚠️ 大量基于标签的弱关联，需要人工审核强关系

---

## 脚本清单

| 脚本 | 功能 | 输出 |
|------|------|------|
| `parse-localisation.mjs` | 解析游戏双语本地化文件 | `data/glossary.yml` |
| `parse-common.mjs` | 解析预设帝国 | `data/entities/empires/` |
| `parse-anomalies.mjs` | 解析异常点+考古遗址 | `data/entities/events/` |
| `parse-technology.mjs` | 解析科技树 | `data/entities/technology/` |
| `parse-species.mjs` | 解析物种类型+特质 | `data/entities/species/` |
| `parse-crisis.mjs` | 解析危机事件链 | `data/entities/crises/` |
| `crawl-wiki.mjs` | 爬取 Wiki 补充 lore（需代理） | 更新各 YAML 的 lore 字段 |
| `build-relations.mjs` | 自动生成实体关系 | 更新各 YAML 的 relations 字段 |
| `build-api.mjs` | 生成静态 JSON API | `public/api/` |
| `build-sqlite.mjs` | 生成 SQLite 数据库 | `stellaris_kb.db` |

---

## 待办

1. [x] 解析 `technology/` → 484 个科技实体
2. [x] 解析 `species_classes/` + `traits/` → 274 个物种实体
3. [x] 解析危机事件链 → 443 个危机实体
4. [ ] 解析 `ascension_perks/` → 可并入 technology 或单独分类
5. [ ] 解析灵能/虚境 → `data/entities/psionic/`
6. [ ] Wiki 爬虫补 lore（需代理网络）
7. [ ] 人工审核并强化关键实体关系
8. [ ] 添加搜索功能（Pagefind）
