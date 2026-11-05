---
title: MarkIt 使用手册
version: 1.3.1
author: MarkIt Team
updated: 2026-11-02
tags: markdown, mermaid, 编辑器, 使用手册
description: |
  本文档随应用内置，既是 MarkIt 的操作指南，
  也是 Markdown 与 Mermaid 渲染能力的完整示例。
---

# MarkIt 使用手册

> **MarkIt** 是一款轻量、精致的本地 Markdown 编辑器。
> 它把「写作」与「呈现」放在同一个窗口里：左边输入 Markdown，右边实时看到成品。

本文档是应用内置的欢迎页，同时承担两个角色：

1. **操作手册**：介绍文件、标签页、布局、主题、大纲、导出等全部功能。
2. **示例文档**：把 MarkIt 支持的 Markdown 语法和所有 Mermaid 图表类型都演示一遍。

> 💡 本文档处于「未保存」的新建标签状态。修改后按 `Ctrl + S` 会提示另存为文件；
> 从磁盘打开其他文档时，未编辑的欢迎页会自动被替换。

## 目录

1. 快速开始
2. 工作区与界面
3. Markdown 语法参考
4. 文档信息（Frontmatter）
5. Mermaid 图表大全
6. 图表交互
7. 导出 PDF
8. 快捷键
9. 常见问题与技巧

## 1. 快速开始

### 1.1 打开、新建与保存

| 操作 | 入口 | 说明 |
|------|------|------|
| 新建标签页 | `Ctrl + N` | 新建空白文档；重复新建会复用未编辑的空白标签 |
| 打开文件 | `Ctrl + O` | 支持一次多选，`.md`、`.markdown`、`.txt` 均可 |
| 保存 | `Ctrl + S` | 新文档首次保存会打开「另存为」对话框 |
| 另存为 | `Ctrl + Shift + S` | 保存到新路径后，标签页会自动改名 |
| 手动刷新 | `F5` 或 `Ctrl + R` | 强制重新读取磁盘内容；磁盘变化通常会自动同步 |

文件统一以 UTF-8 读写。Windows 下也可以直接双击 `.md` 文件，或右键选择「使用 MarkIt 打开」。

MarkIt 会自动跟随磁盘变化：当前标签的文件被其他程序修改后立即同步；切换到非活跃标签时也会先读取一次磁盘。如果本地还有未保存的修改，不会立刻打断编辑——保存（`Ctrl + S`）时才会检测冲突，并列出磁盘版本与本地版本的逐行差异。

### 1.2 多标签页

- 每个标签独立保留**内容、撤销历史、光标位置、布局模式，以及编辑区与预览区的滚动位置**，来回切换不会丢失状态。
- 标签上的圆点表示「有未保存修改」，中键可以快速关闭标签。
- 右键标签页可以选择「关闭 / 关闭其他 / 关闭左侧 / 关闭右侧」，批量关闭时仍会逐个确认未保存修改。
- `Ctrl + Tab` / `Ctrl + Shift + Tab` 循环切换，`Ctrl + 1` ~ `Ctrl + 9` 直达第 N 个标签。
- 重复打开同一个文件时，不会产生重复标签，而是直接激活已有标签。
- 打开或新建文档后会立即切换到该标签，并从文档开头开始浏览。

### 1.3 未保存修改保护

关闭标签页、关闭窗口或安装更新前，MarkIt 都会逐一检查未保存的文档，并提供三个选择：

- **保存**：保存后继续操作
- **放弃**：丢弃修改
- **取消**：留在当前文档

保存时如果磁盘上的文件已被其他程序修改，而本地又有未保存修改，会弹出「文件冲突」提示，并列出两边的逐行差异：

- 红色 `−` 行：磁盘上的内容
- 绿色 `+` 行：本地未保存的内容

可以选择：

- **覆盖磁盘**：用本地内容覆盖磁盘上的修改
- **载入磁盘**：丢弃本地修改，载入磁盘上的最新内容
- **取消**：保留本地修改，返回编辑器继续编辑

自动刷新不会在检测到磁盘变化时立即弹出该提示；手动刷新（`F5` / `Ctrl + R`）时也会展示同样的差异。

### 1.4 会话恢复

退出应用或自动更新重启后，MarkIt 会恢复上次的标签页：

- 标签顺序与当前激活的标签
- 每个标签的光标位置与布局模式
- **尚未保存的新建文档内容**
- 文件类标签优先读取磁盘上的最新内容

## 2. 工作区与界面

### 2.1 四种布局

按 `Ctrl + \` 可以在四种布局之间循环切换：

1. **左编辑 / 右预览**：最常用的写作布局
2. **左预览 / 右编辑**：适合校对与检查排版
3. **仅编辑**：专注输入，适合长文写作
4. **仅预览**：专注阅读，适合演示与检查成果

布局按标签记忆：每个标签保留自己的布局，切换标签时界面自动跟随；新建标签继承当前标签的布局，退出重启后随会话一起恢复。

双栏模式下拖动中间的**分隔条**即可调整比例，比例会被记住，下次启动仍然生效。

### 2.2 自动大纲

- 大纲面板根据标题层级自动生成，代码块里的 `#` 不会被误判为标题。
- 点击任意条目，编辑区与预览区会同时滚动到对应章节。
- 用 `Ctrl + Shift + O` 显示或隐藏大纲；拖拽面板右边缘可在 160–500px 之间调整宽度。

### 2.3 主题与预览样式

| 项目 | 可选值 | 说明 |
|------|--------|------|
| 界面主题 | 跟随系统 / 浅色 / 深色 | 编辑器、预览区和界面组件同步切换 |
| 预览样式 | GitHub / Dark / Academic / Minimal | 每套样式都提供亮色与暗色版本 |
| 自定义样式 | 导入本地 CSS | 在当前运行期间可用 |

### 2.4 预览宽度与窗口缩放

- 预览内容支持**固定宽度**（可在设置中调节）与**自适应**两种模式。
- 整窗缩放：`Ctrl + =` 放大、`Ctrl + -` 缩小、`Ctrl + 0` 恢复 100%，范围 50%–300%。
- 状态栏会实时显示文件名、行列号、字数、编码、布局模式与当前缩放比例。

### 2.5 窗口与自动更新

- 无边框毛玻璃窗口，标签页合并到标题栏；拖动标题栏空白区域可以移动窗口。
- 自动记住窗口大小、位置与最大化状态，下次启动时恢复。
- 启动约 3 秒后静默检测新版本，也可以在设置页手动检查更新。
- 下载过程显示进度与速度；下载完成后选择「重启安装」，重启后自动恢复原文档。

## 3. Markdown 语法参考

### 3.1 标题

使用 1–6 个 `#` 表示六级标题。标题会同时出现在自动大纲中。

#### 这是四级标题

##### 这是五级标题

###### 这是六级标题

### 3.2 文本样式

- **粗体**：`**粗体**`
- *斜体*：`*斜体*`
- ***粗斜体***：`***粗斜体***`
- ~~删除线~~：`~~删除线~~`
- `行内代码`：使用反引号包裹
- 普通文本、上标式写法如 E = mc^2 会按原文显示（MarkIt 不解析数学公式）

### 3.3 列表

无序列表：

- 轻量的本地编辑器
  - 实时预览
  - 多标签页
    - 独立撤销历史
- Mermaid 图表

有序列表：

1. 写下想法
2. 整理结构
3. 导出交付

任务清单：

- [x] 支持多标签页
- [x] 支持 Mermaid 图表
- [ ] 继续补充更多示例

> MarkIt 会按原文显示任务清单的 `[ ]` / `[x]` 标记，不会渲染成交互式复选框。

### 3.4 引用

> 好的文档不是一次写成的，
> 而是在预览与修改之间逐渐清晰起来的。
>
> > 引用可以嵌套，用于表达层次关系。
>
> —— MarkIt 使用手册

### 3.5 表格

表格支持左对齐、居中和右对齐：

| 功能 | 状态 | 说明 |
|:-----|:----:|-----:|
| 实时预览 | ✅ | 输入即渲染 |
| Mermaid 图表 | ✅ | 缩放 / 弹窗 / 导出 |
| PDF 导出 | ✅ | 保留预览样式 |
| 自定义样式 | ✅ | 导入本地 CSS |

### 3.6 链接

- 站外链接：[Electron](https://www.electronjs.org/)
- 自动识别网址：https://mermaid.js.org/
- 本地文件链接：`[查看说明](./README.md)`

预览区的点击规则：

- `http` / `https` / `mailto` 链接交给系统默认浏览器打开
- 本地文件链接会在系统文件管理器中定位
- 页内锚点保持原生跳转，其他协议一律忽略

### 3.7 图片

支持 PNG、JPEG、GIF、WebP、BMP、SVG、AVIF、ICO、TIFF 等常见格式。

```markdown
![示意图](./images/demo.png)
![网络图片](https://example.com/banner.png)
```

相对路径会以**当前文档所在目录**为基准解析，因此移动文档时建议连同图片目录一起移动。

### 3.8 代码

行内代码：`npm run dev`

围栏代码块可以标注语言，编辑器会为代码块提供多语言语法高亮：

```typescript
interface DocumentTab {
  path: string | null
  content: string
  isModified: boolean
}

function createTab(path: string | null, content: string): DocumentTab {
  return { path, content, isModified: false }
}
```

```python
def word_count(text: str) -> int:
    return len("".join(text.split()))
```

```json
{
  "name": "mark-it",
  "version": "1.3.1",
  "description": "轻量 Markdown 编辑器"
}
```

```bash
npm install
npm run dev
npm run build:win
```

### 3.9 内嵌 HTML

Markdown 中可以直接写入 HTML，例如 <kbd>Ctrl</kbd> + <kbd>S</kbd> 这样的按键提示，或用 <mark>高亮标记</mark> 强调一段内容。

### 3.10 分隔线与换行

三条或更多 `-`、`*`、`_` 会渲染为分隔线：

---

MarkIt 开启了软换行支持，单个回车也会产生换行，
适合逐行记录灵感或写诗。

## 4. 文档信息（Frontmatter）

文档最上方用 `---` 包裹的 YAML 属性块称为 frontmatter。MarkIt 不会把它显示成原始 YAML 文本，而是渲染为本文档顶部的「文档信息」表格。

支持的基础写法：

```yaml
---
title: 项目周报
author: 张三
date: 2026-11-02
tags: 周报, 项目, 进展
description: |
  第一行说明
  第二行说明
---
```

- 顶层 `key: value` 会显示为一行属性
- 引号字符串会自动去掉引号
- `|` 保留换行，`>` 折叠为空格
- 缩进续行会原样合并到上一个属性中
- 顶格 `#` 注释不会显示

frontmatter 同时会影响大纲解析：正文标题从属性块之后开始计算，层级与预览保持一致。

## 5. Mermaid 图表大全

MarkIt 会自动渲染 Mermaid 代码块。代码块的语言标记不必写成 `mermaid`，也可以直接写图表类型，并兼容大小写与 `-beta` / `-v2` 后缀。

| 类别 | 可用语言标记 |
|------|--------------|
| 流程图 | `mermaid`、`mmd`、`flowchart`、`flow`、`graph` |
| 时序 / 类 / 状态 / ER | `sequence`、`sequenceDiagram`、`class`、`classDiagram`、`state`、`stateDiagram-v2`、`er`、`erDiagram` |
| 计划与时间 | `gantt`、`journey`、`timeline` |
| 思维导图 / 统计 | `mindmap`、`pie`、`gitGraph`、`quadrantChart` |
| 数据图表 | `xychart` / `xychart-beta`、`sankey` / `sankey-beta`、`radar` / `radar-beta`、`treemap` / `treemap-beta` |
| 其他 | `block`、`packet`、`requirementDiagram`、`architecture`、`kanban`、`info`、`C4Context` / `C4Container` / `C4Component` / `C4Dynamic` / `C4Deployment` |

下面按类型逐一演示。修改任意代码块，预览区都会即时重新渲染。

> 代码块的第一行仍要写图表类型（例如 `gantt`、`pie`）。围栏上的语言标记只用于告诉 MarkIt「这个代码块需要交给 Mermaid 渲染」。

### 5.1 流程图（flowchart）

流程图适合表达步骤、分支与循环。

```flowchart
flowchart TD
    A([启动 MarkIt]) --> B{已有文档？}
    B -- 是 --> C[打开本地 Markdown]
    B -- 否 --> D[新建标签页]
    C --> E[编辑内容]
    D --> E
    E --> F[实时预览]
    F --> G{需要图表？}
    G -- 是 --> H[Mermaid 代码块]
    H --> F
    G -- 否 --> I{确认无误？}
    I -- 否 --> E
    I -- 是 --> J[Ctrl + S 保存]
    J --> K([导出 PDF])
    subgraph 自动保存
      L[会话持久化]
    end
    E -.-> L
```

### 5.2 时序图（sequenceDiagram）

时序图适合描述多个角色之间的调用顺序与分支。

```sequence
sequenceDiagram
    autonumber
    actor U as 写作者
    participant E as 编辑器
    participant P as 实时预览
    participant D as 本地磁盘
    U->>E: 输入 Markdown
    E->>P: 解析并渲染
    P-->>U: 即时显示效果
    U->>E: Ctrl + S
    E->>D: 以 UTF-8 写入文件
    alt 保存成功
        D-->>E: 返回成功
        E-->>U: 清除未保存标记
    else 保存失败
        D-->>E: 返回错误
        E-->>U: 显示错误提示
    end
    Note over E,P: 编辑区与预览区滚动同步
```

### 5.3 类图（classDiagram）

类图适合描述类型、属性、方法与它们之间的关系。

```class
classDiagram
    direction LR
    class Document {
        +String path
        +String content
        +Boolean dirty
        +save()
        +saveAs(path)
    }
    class Tab {
        +String title
        +Boolean dirtyMark
        +activate()
        +close()
    }
    class Preview {
        +render(content)
        +exportPdf()
    }
    class Outline {
        +HeadingItem[] headings
        +jumpTo(index)
    }
    Document "1" --> "1" Tab : 对应
    Tab "1" *-- "0..*" Outline : 生成
    Preview ..> Document : 读取内容
```

### 5.4 状态图（stateDiagram-v2）

状态图适合表达文档、订单、流程等对象的状态迁移。

```state
stateDiagram-v2
    [*] --> Clean
    Clean --> Dirty : 输入内容
    Dirty --> Saved : Ctrl + S
    Saved --> Clean : 清除修改标记
    Dirty --> Clean : 撤销全部修改
    Dirty --> [*] : 放弃修改
    Saved --> Dirty : 继续编辑
    state Dirty {
        [*] --> Editing
        Editing --> Rendering : 内容变化
        Rendering --> Editing : 渲染完成
    }
```

### 5.5 ER 图（erDiagram）

ER 图适合描述数据实体与它们之间的关联。

```er
erDiagram
    DOCUMENT ||--o{ TAB : "打开"
    TAB ||--o{ DIAGRAM : "包含"
    DOCUMENT {
        string path PK
        string content
        boolean dirty
    }
    TAB {
        string title
        int cursorLine
        int cursorCol
    }
    DIAGRAM {
        string type
        string source
    }
```

### 5.6 甘特图（gantt）

甘特图适合排期、里程碑与迭代计划。

```gantt
    gantt
    title MarkIt 迭代计划
    dateFormat YYYY-MM-DD
    axisFormat %m-%d
    excludes weekends
    section 编辑体验
    多标签页            :done,    t1, 2026-10-01, 7d
    大纲与滚动同步      :active,  t2, after t1, 5d
    图表缩放            :         t3, after t2, 4d
    section 发布流程
    PDF 导出            :         t4, after t3, 3d
    发布 1.3.1          :milestone, m1, after t4, 0d
```

### 5.7 用户旅程图（journey）

用户旅程图适合从体验角度梳理任务与满意度。

```journey
    journey
    title 使用 MarkIt 写作的旅程
    section 打开文档
      启动应用: 5: 写作者
      打开 Markdown: 4: 写作者
    section 编辑内容
      编写正文: 4: 写作者
      插入图表: 3: 写作者
      调整格式: 4: 写作者
    section 交付
      导出 PDF: 5: 写作者
      分享文件: 5: 写作者
```

### 5.8 时间线（timeline）

时间线适合按时间顺序展示版本、事件与计划。

```timeline
    timeline
    title MarkIt 版本时间线
    section 2026
      1.0 : 多标签页
          : 自动大纲
      1.1 : Mermaid 图表
      1.2 : 主题与预览样式
      1.3 : Frontmatter 表格
          : 图表弹窗预览
    section 未来
      1.4 : 更多协作能力
```

### 5.9 思维导图（mindmap）

思维导图适合发散思考与整理文档结构。

```mindmap
mindmap
  root((MarkIt))
    编辑
      CodeMirror 6
      多标签页
      格式化工具栏
    预览
      Markdown-it
      Mermaid 图表
      自动大纲
    导出
      PDF
      SVG 与 PNG
```

### 5.10 饼图（pie）

饼图适合展示占比与构成。

```pie
    pie showData
    title 文档类型分布
    "技术文档" : 45
    "会议纪要" : 25
    "个人笔记" : 20
    "其他" : 10
```

### 5.11 Git 分支图（gitGraph）

Git 分支图适合解释分支、合并与发布节奏。

```gitGraph
    gitGraph
    commit id: "init"
    commit id: "multi-tab"
    branch develop
    checkout develop
    commit id: "mermaid"
    commit id: "scroll-sync"
    checkout main
    merge develop
    commit id: "v1.3.1"
```

### 5.12 象限图（quadrantChart）

象限图适合做优先级与价值评估。

```quadrantChart
    quadrantChart
    title 功能优先级评估
    x-axis 实现成本低 --> 实现成本高
    y-axis 使用频率低 --> 使用频率高
    quadrant-1 优先实现
    quadrant-2 保持现状
    quadrant-3 暂缓
    quadrant-4 评估价值
    实时预览: [0.2, 0.9]
    Mermaid 图表: [0.45, 0.85]
    多标签页: [0.35, 0.75]
    PDF 导出: [0.6, 0.5]
    自动更新: [0.8, 0.35]
```

### 5.13 XY 图（xychart-beta）

XY 图适合展示柱状与折线组合的数据趋势。

```xychart-beta
    xychart-beta
    title "每周写作字数"
    x-axis ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    y-axis "字数" 0 --> 3000
    bar [1200, 1800, 900, 2400, 2100, 600, 1500]
    line [1200, 1800, 900, 2400, 2100, 600, 1500]
```

### 5.14 桑基图（sankey-beta）

桑基图适合展示流量、转化与去向分布。

```sankey-beta
    sankey-beta
    Draft,Review,30
    Draft,Archive,10
    Review,Published,25
    Review,Revision,5
    Revision,Published,5
```

> 桑基图的字段名使用英文标识：Draft 为草稿、Review 为审阅、Published 为发布、Revision 为修改、Archive 为归档。

### 5.15 雷达图（radar-beta）

雷达图适合多维度能力对比。

```radar-beta
    radar-beta
    title 编辑器能力雷达
    axis edit["编辑"], preview["预览"], diagram["图表"], export["导出"], theme["主题"], tabs["多标签"]
    curve markit["MarkIt"]{4, 5, 5, 4, 5, 5}
    curve classic["传统编辑器"]{3, 3, 1, 2, 2, 4}
    max 5
    min 0
```

### 5.16 矩形树图（treemap-beta）

矩形树图适合用面积表达层级数据的占比。

```treemap-beta
    treemap-beta
    "文档"
      "写作"
        "技术文档": 45
        "个人笔记": 30
        "会议纪要": 25
      "导出"
        "PDF": 60
        "图片": 40
```

### 5.17 块图（block-beta）

块图适合表达模块划分与模块之间的关系。

```block-beta
    block-beta
    columns 3
    editor["编辑区"] preview["预览区"] outline["大纲"]
    editor --> preview
    preview --> outline
    style editor fill:#6c9bff,color:#fff
```

### 5.18 数据包图（packet-beta）

数据包图适合描述二进制报文、协议字段与位区间。

```packet-beta
    packet-beta
    0-2: "分隔线"
    3-15: "frontmatter"
    16-31: "正文"
```

### 5.19 需求图（requirementDiagram）

需求图适合表达需求、要素与满足关系。

```requirementDiagram
    requirementDiagram
    requirement RealtimePreview {
        id: 1
        text: "编辑后预览即时刷新"
        risk: medium
        verifymethod: test
    }
    requirement Stability {
        id: 2
        text: "单个图表失败不影响其他内容"
        risk: high
        verifymethod: test
    }
    element Editor {
        type: diagram
    }
    Editor - satisfies -> RealtimePreview
    Editor - satisfies -> Stability
```

### 5.20 架构图（architecture-beta）

架构图适合描述服务、分组与部署拓扑。

```architecture-beta
    architecture-beta
    group app(cloud)["MarkIt"]
    service editor(server)["编辑区"] in app
    service preview(server)["预览区"] in app
    service disk(database)["本地磁盘"] in app
    editor:R -- L:preview
    editor:B -- T:disk
```

### 5.21 看板（kanban）

看板适合任务分栏与状态管理。

```kanban
    kanban
    todo[待办]
      t1[补充快捷键说明]
      t2[录制演示动图]
    doing[进行中]
      t3[完善使用手册]
    done[已完成]
      t4[支持图表弹窗预览]
```

### 5.22 信息图（info）

信息图会显示当前 Mermaid 版本与运行信息，适合排查渲染环境。

```info
info
```

### 5.23 C4 架构图（C4Context / C4Container）

MarkIt 支持 C4 系列的上下文图、容器图、组件图、动态图与部署图。下面分别是系统上下文与容器视图：

```C4Context
    C4Context
    title MarkIt 系统上下文
    Person(user, "写作者", "使用 MarkIt 编写文档")
    System(markit, "MarkIt", "本地 Markdown 编辑器")
    System_Ext(os, "操作系统", "文件系统与 PDF 打印")
    Rel(user, markit, "编辑与预览")
    Rel(markit, os, "读写文件 / 导出")
```

```C4Container
    C4Container
    title MarkIt 容器视图
    Person(user, "写作者")
    Container(app, "MarkIt 桌面应用", "Electron", "编辑、预览与导出")
    ContainerDb(fs, "本地文件系统", "NTFS / APFS", "保存 Markdown 文件")
    Rel(user, app, "使用")
    Rel(app, fs, "读写")
```

## 6. 图表交互

### 6.1 缩放

每个渲染后的图表右上角都有一组控件：

- `−` / `＋`：按 1.25 倍步进缩小或放大
- 中间百分比：点击恢复 100%
- 缩放范围：25%–400%，超出可视区域时滚动查看

也可以按住 `Ctrl` / `Cmd` 并滚动鼠标滚轮缩放图表，不会触发整窗缩放。

### 6.2 弹窗预览

点击工具栏的「预览」按钮，或直接**双击图表**，可以打开大图弹窗：

- 弹窗内可滚动、缩放、适应窗口
- 适合检查复杂图表的细节
- 可直接在弹窗中下载 SVG / PNG

### 6.3 导出图表

图表工具栏提供 `SVG` 与 `PNG` 两个下载按钮：

- 通过系统「保存文件」对话框选择位置
- PNG 按 2 倍分辨率导出
- 导出背景会跟随当前主题，避免深色图表出现白底

### 6.4 渲染失败提示

如果 Mermaid 语法有误，MarkIt 会保留原始代码块，并在下方显示：

> 图表渲染失败（语言标记）：失败原因

把鼠标悬停在提示上可以查看完整错误信息，修改语法后会自动重新渲染。

## 7. 导出 PDF

按 `Ctrl + P` 打开导出对话框：

- 纸张：A4 / Letter
- 导出内容保留当前预览样式
- 已渲染的 Mermaid 图表会一并导出
- 页面背景跟随当前主题打印

## 8. 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + N` | 新建标签页 |
| `Ctrl + O` | 打开文件（支持多选） |
| `Ctrl + S` | 保存文件 |
| `Ctrl + Shift + S` | 另存为 |
| `Ctrl + W` | 关闭当前标签页 |
| `Ctrl + Tab` / `Ctrl + Shift + Tab` | 切换标签页 |
| `Ctrl + 1` ~ `Ctrl + 9` | 跳到第 N 个标签页 |
| `F5` / `Ctrl + R` | 手动刷新（重新读取磁盘） |
| `Ctrl + B` | 加粗 |
| `Ctrl + I` | 斜体 |
| `Ctrl + K` | 插入链接 |
| `Ctrl + Shift + K` | 插入代码块 |
| `Ctrl + Shift + O` | 切换大纲面板 |
| `Ctrl + \` | 循环切换布局 |
| `Ctrl + P` | 导出 PDF |
| `Ctrl + ,` | 打开 / 关闭设置 |
| `Ctrl + =` / `Ctrl + -` / `Ctrl + 0` | 整窗放大 / 缩小 / 恢复 100% |
| `Ctrl` / `Cmd` + 滚轮 | 缩放 Mermaid 图表 |

> macOS 上把 `Ctrl` 替换为 `Cmd` 即可；标签页切换使用 `Ctrl + Tab`，避免与系统应用切换冲突。

## 9. 常见问题与技巧

### 9.1 图片不显示

- 确认图片使用相对路径时，位置相对当前文档所在目录
- 图片文件扩展名需要在支持列表中
- 网络图片需要能正常访问网络

### 9.2 图表没有渲染

- 检查代码块的语言标记是否为支持的图表类型
- 复杂语法可以先用最小示例验证，再逐步补全
- 查看「图表渲染失败」提示中的具体原因

### 9.3 想使用自己的预览样式

在设置中导入本地 CSS 文件即可。自定义样式在当前运行期间可用，适合临时调整字体、间距与配色。

### 9.4 文档会保存在哪里

MarkIt 是本地编辑器：点击保存后内容写入你选择的文件，不会上传到云端。会话恢复数据仅用于下次启动时还原标签页。

---

**开始写作吧。** 按 `Ctrl + N` 新建一个空白文档，或按 `Ctrl + O` 打开已有的 Markdown 文件。
