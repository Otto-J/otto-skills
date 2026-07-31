# 电子书 RAG 来源绑定规则

## 1. 目标

把 PDF、MOBI、EPUB 等电子书处理成可检索文字，同时保证每段文字都能回到原始文件中的确定位置，并能展示整页截图或按需生成局部截图。

系统需要支持以下返回结果：

- 回答文字。
- 用于回答的原始文字片段。
- 书名和原始文件。
- PDF 文件页码与书内印刷页码，或 MOBI/EPUB 的章节与位置。
- 原始页面截图；存在坐标时提供局部截图。

## 2. 核心原则

### 2.1 原始文件不可变

每本书使用原始文件的 SHA-256 建立 `source_id`。重新识别可以产生新版本，但不得覆盖原文件、旧 OCR 响应或人工校订记录。

### 2.2 OCR 文字不等于绝对原文

扫描页的最终证据是页面图像。Qwen 输出应命名为 `extracted_text` 或 `normalized_text`，不要在数据结构中直接命名为 `original_text`。只有 PDF 原生文字层或 EPUB/MOBI 的 XHTML 文本才能标记为 `native_text`。

### 2.3 检索文本与引用文本分离

- `retrieval_text`：允许清理断行、空格和标题格式，用于切块及向量检索。
- `quote_text`：保持识别结果，不由回答模型重写，用于展示来源片段。
- `reviewed_text`：人工对照页面后确认的文字，可选。

优先级为 `reviewed_text > native_text > extracted_text`。任何层级都保留自己的来源和版本。

### 2.4 所有检索块必须能回到 Passage

向量数据库中的 Chunk 只负责召回，不作为引用来源。每个 Chunk 必须保存一个或多个 `passage_id`；回答引用由 Passage 的定位信息生成。

### 2.5 不为流式电子书虚构页码

PDF 使用固定页码。MOBI/EPUB 属于可重排内容时，使用章节、spine、文件片段和文字锚点定位；只有源文件明确提供页码时才记录页码。

## 3. 数据层级

```text
Source    一本不可变的原始电子书
  └─ Unit PDF 页面，或 MOBI/EPUB 章节文档
      └─ Passage 标题、段落、列表项、提示框等最小引用单元
          └─ Chunk 一个或多个 Passage 组成的检索窗口
```

### Source

记录书名、格式、文件路径、哈希、语言、总页数、识别工具和识别版本。

### Unit

- PDF：一页是一个 Unit。
- MOBI/EPUB：spine 中的一个 XHTML/HTML 文档是一个 Unit。

### Passage

Passage 是引用的最小单位，通常是一个标题、自然段、列表项或独立提示框。它保存文字、标题路径和原始位置。

### Chunk

Chunk 是 RAG 检索单元。推荐由相邻 Passage 动态组合，不直接切断自然段。中文正文建议约 400～800 字，重叠通过重复 `passage_id` 实现，而不是复制一份失去来源关系的文字。

## 4. 推荐目录

```text
library/
├── catalog.jsonl
└── sources/
    └── <source_id>/
        ├── manifest.json
        ├── original/
        │   └── book.pdf
        ├── pages/
        │   ├── page-000093.png
        │   └── page-000093.md
        ├── ocr/
        │   ├── page-000093.json
        │   └── page-000093-response.json
        ├── chapters/
        │   └── spine-0012.xhtml
        ├── assets/
        │   └── images/
        ├── passages/
        │   └── passages.jsonl
        ├── chunks/
        │   └── chunks.jsonl
        └── crops/
```

原文件也可以只保存绝对路径或对象存储 URI，但必须同时记录 SHA-256，且该文件不能被静默替换。

## 5. PDF 处理规则

### 5.1 判断类型

1. 尝试读取原生文字层。
2. 抽样检查文字是否完整、有序且不是乱码。
3. 文字层可靠时使用原生文字；否则按扫描 PDF 处理。

### 5.2 扫描 PDF

第一阶段采用简单、稳定的页级方案：

1. 每页渲染为 PNG，建议 180～200 DPI。
2. 使用 Qwen OCR 生成 Markdown。
3. 保存完整 API 响应和提示词版本。
4. 按标题、段落、列表和提示框拆成 Passage。
5. 每个 Passage 绑定 `pdf_page`、`printed_page` 和 `page_image`。
6. 没有坐标时将 `citation_granularity` 标为 `page`，引用时展示整页图。

第二阶段按需增强：

1. 只对被引用较多或需要精确截图的页面执行带坐标 OCR。
2. 坐标统一转换成左上角为原点、范围为 0～1 的归一化坐标。
3. 将 Qwen 段落与坐标 OCR 通过文字相似度对齐。
4. 保存 `bbox` 后，局部截图可以随时从原始页图重新生成。

### 5.3 页码

- `pdf_page`：PDF 文件中的页序号，从 1 开始，必须保存。
- `printed_page`：扫描页面上印刷的页码，使用字符串；封面、目录或罗马数字也能表示。
- 不允许只保存两者的固定差值。若确认连续区间可保存映射规则，但具体 Passage 仍应写入解析后的页码。

### 5.4 PDF 内图片

扫描 PDF 的整页本身就是来源图。第一阶段不必强行分离插图。数字 PDF 可额外提取嵌入图片，但引用仍优先保留完整页面渲染图，因为它包含正文与图片的原始排版关系。

## 6. MOBI/EPUB 处理规则

### 6.1 解包和正文

1. MOBI 优先转换为 EPUB 或解包成 XHTML，不要先转成无结构 TXT。
2. 保存原始 spine 顺序、XHTML 路径、元素 ID、标题层级和原始图片资源。
3. 从 DOM 提取段落，保留 `href`、`fragment_id`、`dom_path` 和段落序号。
4. Markdown 是派生阅读版，XHTML 和原始 MOBI/EPUB 才是可回溯来源。

### 6.2 流式位置

可重排电子书没有稳定页码，使用组合定位器：

```json
{
  "type": "reflowable",
  "spine_index": 12,
  "href": "Text/chapter07.xhtml",
  "fragment_id": "jaundice",
  "dom_path": "section:nth-of-type(2) > p:nth-of-type(4)",
  "text_anchor": {
    "prefix": "前方少量文字",
    "exact": "用于引用的原始文字",
    "suffix": "后方少量文字"
  }
}
```

DOM 可能在重新转换后变化，因此必须同时保存 `text_anchor`。定位时先使用 DOM，再使用 exact/prefix/suffix 校验或恢复位置。

### 6.3 MOBI/EPUB 截图

截图由原始 XHTML 和资源按固定渲染配置生成，并记录视口、字体、字号、行高和渲染器版本。它是“可复现渲染图”，不是原书固定页图。用户界面应显示“第 7 章 · 位置 1234”，而不是虚构“第 68 页”。

原书内的图片必须原样保存到 `assets/images/`，并在 Passage 中记录对应 DOM 图片引用。

## 7. Passage 必填字段

| 字段 | 说明 |
|---|---|
| `passage_id` | 来源内稳定 ID，由 source、unit 和顺序组成 |
| `source_id` | 原文件 SHA-256 派生 ID |
| `sequence` | 全书阅读顺序 |
| `heading_path` | 章、节、小节标题数组 |
| `text_kind` | `native_text`、`ocr_text` 或 `reviewed_text` |
| `quote_text` | 可展示的来源文字 |
| `retrieval_text` | 用于检索的规范化文字 |
| `locator` | PDF 或 reflowable 定位器 |
| `asset_ref` | 页面图、XHTML 或原图资源 |
| `verification` | `native`、`ocr_unverified` 或 `human_reviewed` |
| `text_sha256` | 文字内容校验值 |
| `extraction_run_id` | 对应识别批次和模型版本 |

可选字段包括 `bbox`、`reviewed_text`、置信度、相邻 Passage、表格结构、图片引用和脚注引用。

## 8. Chunk 规则

1. 优先按标题和自然段组合，不能从句子中间任意切开。
2. 不跨章节；一般不跨 PDF 页面。确需跨页时必须保留全部 `passage_id`。
3. Chunk 中保存 `passage_ids`、组合后的 `retrieval_text` 和 embedding 版本。
4. Chunk 不单独保存“页码真相”，页码从 Passage 解析，避免重复数据失配。
5. 更新 OCR 后重新生成 Chunk 和 embedding，但保留旧 extraction run 以便审计。

## 9. 回答和引用规则

每条引用至少返回：

```json
{
  "source_id": "book-7f3a...",
  "title": "崔玉涛育儿百科",
  "passage_ids": ["book-7f3a:pdf:000093:p0004"],
  "location_label": "PDF 第 93 页 / 书内第 61 页",
  "quote": "黄疸出现的关键原因，是宝宝体内胆红素增高……",
  "source_file": "original/book.pdf",
  "page_image": "pages/page-000093.png",
  "crop_image": null,
  "verification": "ocr_unverified"
}
```

回答系统必须遵守：

1. 答案可以归纳，但 `quote` 必须直接取自 Passage，不能由回答模型重新生成。
2. PDF 同时显示文件页和书内页；没有印刷页码时只显示 PDF 页。
3. MOBI/EPUB 显示章节和位置，不显示虚构页码。
4. OCR 未人工核对时显示“机器识别”状态，并允许打开原图核对。
5. 没有 bbox 时提供整页截图；有 bbox 时同时提供局部截图和完整页入口。
6. 一个结论涉及多页时拆分为多条引用，不把多页伪装成一个来源位置。

## 10. 版本和审计

每次识别生成独立 `extraction_run_id`，至少记录：

- 模型与接口名称。
- 提示词及其 SHA-256。
- 输入图像分辨率。
- 温度等主要参数。
- 请求时间、响应 ID 和 token 用量。
- 处理程序版本。
- 生成文件的 SHA-256。

人工修订不得直接覆盖 OCR 字段，应写入 `reviewed_text`、修订人和修订时间。

## 11. 推荐实施顺序

### 第一阶段：先完成可用 RAG

- PDF：整页 PNG + Qwen Markdown + 页级 JSON。
- MOBI/EPUB：XHTML + 图片资源 + 章节/DOM/文字锚点。
- 生成 Passage 和 Chunk，完成文字召回。
- 回答时返回文字、定位信息和整页图或章节入口。

### 第二阶段：增强精确引用

- 对高频引用页面补充 bbox。
- 自动生成局部截图。
- 增加 OCR 原文与页面图的人工校订状态。

### 第三阶段：质量治理

- OCR 模型升级和多模型差异检测。
- 对数字、剂量、时间、专有名词等高风险内容自动标记复核。
- 建立失效定位、哈希变化和缺图检查。

## 12. 当前两本书的处理建议

- 《崔玉涛育儿百科》扫描 PDF：采用页级 PNG、Qwen Markdown、PDF 页码和书内页码绑定；第一阶段引用整页图即可。
- 《美国儿科学会育儿百科》第七版 MOBI：优先拆出 XHTML、标题层级和原始图片；使用章节、spine、DOM 与文字锚点定位，不强行生成实体书页码。

这套结构允许 RAG 只索引干净文字，同时让每个召回结果都能独立回到原文件核验。
