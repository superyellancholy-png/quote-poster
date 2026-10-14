# 二流名言 · quote-poster

品牌：**Audience2**。中文名：**二流名言**。

当前版本：**1.5**。更新说明见 [CHANGELOG.md](CHANGELOG.md)。

制作歌词和金句海报，支持红黑照片底绿字、浅绿织纹底红字两种版本。输出 PNG、可编辑 HTML 和排版参数 JSON。

这是当前确认版的公开技能仓库。完整工作流和排版规则见 [SKILL.md](SKILL.md)，配置说明见 [references/unified.md](references/unified.md)。

## 两版案例

两版使用同一段陈奕迅《陀飞轮》歌词，均放大“发票”，便于比较配色与背景效果。

| 红黑底绿字 | 浅绿底红字 |
| --- | --- |
| <img src="docs/examples/darkroom.png" alt="红黑照片底绿字海报案例：曾付出几多心跳，来换取一堆堆的发票" width="360"> | <img src="docs/examples/mint.png" alt="浅绿织纹底红字海报案例：曾付出几多心跳，来换取一堆堆的发票" width="360"> |
| 实拍照片、红黑蒙版与颗粒；需要提供原始照片。 | 浅绿织纹、柔光背景大字；无需提供照片。 |

点击查看原图：[红黑版](docs/examples/darkroom.png) · [浅绿版](docs/examples/mint.png)。案例展示排版效果，正文、强调词和来源仍按每次任务确认。

原技能标识为 `2ndmaxim`，现改为 `quote-poster`。已有安装请将技能目录改为 `quote-poster`，之后使用 `$quote-poster`。

## 安装

需要 Node.js 与 npm。在目标项目根目录执行：

```sh
mkdir -p .agents/skills
git clone https://github.com/superyellancholy-png/quote-poster.git .agents/skills/quote-poster
cd .agents/skills/quote-poster
npm ci
```

在 Codex 中调用 `$quote-poster`。先选择版本，再确认正文断行、正文下方以大号标题单列的放大词以及来源；确认后才生成图片。

## 渲染已确认配置

从技能目录执行：

```sh
node scripts/render-poster.cjs /path/to/config.json /path/to/任务名称/成品
```

将示意路径替换为实际路径。配置中的照片和自定义字体路径相对于配置文件解析。两种版本均使用同一渲染入口，浅绿版无需照片。配置 `outputName` 可在一个任务目录中区分多张海报，不为每张图片建文件夹。

## 验收与修改边界

默认只改配置，使用正式渲染器；异常先定位，不复制临时脚本绕过。每次生成附带验收 JSON，程序通过后仍须查看 PNG；验收方法及规则优先级见 [验收说明](references/acceptance.md)。

## 当前关键规则

- 默认繁体转简体，先展示简体确认稿；明确要求保留原文字形时例外。简繁转换不换字体，缺字明确提示。

- 两版正文和强调字字距统一为 −45 px，强调字号为普通字的 1.55 倍。
- 行距依据小字的视觉节奏，大字局部协调；不能因一行大字拉大所有行距。
- 换行不等于断句，不为行尾额外添加逗号；不规定每行字数相同。
- 可以调整换行，让相关放大词集中并位于各自行首，这是可选方案。
- 歌词来源分两行：作者《作品名称》；作词：姓名　作曲：姓名。
- 名言来源分两行：作者；查证的媒介与具体作品标题。

以上为索引，完整规则以 SKILL.md 为准。

## 文件与素材

`scripts/` 为渲染脚本，`assets/` 为字体、底纹与 Logo，`references/` 为排版说明和参考图，`agents/` 为技能展示配置。

生成的 HTML 共用成品目录下的 `_assets/` 字体与图片，避免重复内嵌。分享可编辑文件时打包整个成品目录，PNG 可单独分享。

原始分卷、压缩包、PSD、历史海报和本机依赖不进入本仓库。素材使用说明见 [NOTICE.md](NOTICE.md)。

## 开源许可

技能指令、渲染脚本及原创文档采用 [MIT License](LICENSE)，允许使用、修改、分享和商业使用，须保留版权与许可声明。

又又意宋、京華老宋体采用作者声明的免费商用授权，包含修改等限制；字体沿用各自许可，具体核查见 [字体授权说明](references/font-licensing.md)。字体、图片、Logo、参考图、案例海报及其中引用的歌词不自动纳入 MIT；具体范围见 [NOTICE.md](NOTICE.md)。
