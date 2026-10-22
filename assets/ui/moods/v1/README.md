# FloFlo 心情素材 v1

8 种心情，每种提供浅色、深色各一张，共 16 张透明 PNG。全部通过内置 **image_gen** 单独生成或编辑，保留原始文件字节；未程序改色、裁图、缩放导出或合成背景。

这是原图资产包，浏览器预览只做 CSS 等比缩放。2026-10-23 已新增 [生产导出脚本](../../../../frontend/scripts/mood-assets.mjs)：16张336×336透明PNG共935,100字节，按内容版本 `0c77c677fbaa99cb` 由后端静态资源接口提供；前端心情选择、头像替换与月历使用这些导出图。原图文件未覆盖。最终部署/体验版状态以项目发布记录为准。

## 文件映射

| 心情 | 标识 | 浅色原图 | 深色原图 |
| --- | --- | --- | --- |
| 开心 | happy | [light/happy.png](light/happy.png) | [dark/happy.png](dark/happy.png) |
| 平静 | calm | [light/calm.png](light/calm.png) | [dark/calm.png](dark/calm.png) |
| 心动 | loving | [light/loving.png](light/loving.png) | [dark/loving.png](dark/loving.png) |
| 想你 | missing | [light/missing.png](light/missing.png) | [dark/missing.png](dark/missing.png) |
| 疲惫 | tired | [light/tired.png](light/tired.png) | [dark/tired.png](dark/tired.png) |
| 低落 | sad | [light/sad.png](light/sad.png) | [dark/sad.png](dark/sad.png) |
| 烦躁 | irritated | [light/irritated.png](light/irritated.png) | [dark/irritated.png](dark/irritated.png) |
| 元气 | energetic | [light/energetic.png](light/energetic.png) | [dark/energetic.png](dark/energetic.png) |

## 显示与主题选择

- **112 × 112 px**：主要心情插画，保留表情和附属物细节。
- **48 × 48 px**：选择器或列表中的图标，建议同时显示心情名称。
- **24 × 24 px**：紧凑状态标记，主要依赖颜色、轮廓和附属物辨识。细眉眼、泪滴等会减弱，应搭配文字名称，不能仅靠细小表情传达状态。
- 按方形画布等比显示，保留原图透明留白，不拉伸。上述尺寸是整张画布的 CSS 像素尺寸，角色可见部分小于画布。
- 浅色表面选择 `light/<id>.png`；深色表面选择 `dark/<id>.png`。深色版本对同一浅色角色做色彩和轮廓适配，保留表情、姿态和道具，不增加夜间主题。
- 已检查背景：浅色 `#ffffff`、`#f6f7fc`；深色 `#17151e`、`#24212d`、`#322b45`。这些颜色来自 `frontend/src/styles/app.scss`；最后一项为深色鸢尾紫主题底色。

打开 [preview.html](preview.html) 可查看每个心情的亮暗对照，统一切换 112 / 48 / 24 px；每个版本都提供原图链接。页面无第三方 JavaScript 依赖，可直接本地打开。桌面并排比较，窄屏换行，保持标示尺寸。

## 实测与透明说明

2026-10-22 使用 sharp 只读解码、文件大小和 SHA-256 校验：

- 16/16 文件齐全，均为 **1254 × 1254 RGBA PNG**，总计 **11,156,983 字节（10.64 MiB）**。保留实际生成尺寸，不因提示词偏好 1024 × 1024 而重采样。
- 16/16 含 alpha 通道，最小值 0、最大值 255，四角 alpha 均为 0；完全透明像素占各图 **60.26%–69.12%**。
- 16/16 与各自生成源文件 SHA-256 一致，证明拷贝后未改变 PNG 字节。
- 原始输出含半透明像素，主体常见 alpha 253/254；轮廓外围有少量极低不透明度像素，包含 alpha=1 的零星散点。它们随原图保留，没有做自动抠图或透明度清理。
- [manifest.json](manifest.json) 同时记录任意非零 alpha 边界与 `alpha > 8` 的可见主体边界，避免极淡散点使边界误读。阈值只用于测量，未改动图片。坐标从 0 开始，右、下边界均包含在内。
- 8 组亮暗版在 `alpha > 8` 阈值下的轮廓交并比为 **98.11%–99.10%**，并逐组目检表情、姿态和道具。生成式编辑保留了视觉几何，不能视为像素级完全一致。
- 浏览器中 40 个背景展示位全部成功加载。112 / 48 / 24 px 控件和实际图像显示尺寸一致；390 px 窄屏已检查，无水平溢出。小尺寸清晰度结论见上节，不等同于小程序真机验收。

开心和元气原图各有四条金色短线，延续同一造型基准；元气模板写的是两到三条，原图保留实际生成结果。

## 生成依据与完整提示词

以用户已确认的八心情参考图为造型依据，以开心原图为线条和完成度基准。深色版均以各自最终浅色 PNG 为编辑目标。参考图路径、色系、模板和规则保存在 [generation-spec.json](generation-spec.json)。

每张最终文件的来源路径、实际使用的完整提示词和最终路径分别记录于：

- [generation-initial.json](generation-initial.json)：开心亮暗版、平静浅色版。
- [generation-calm-dark.json](generation-calm-dark.json)：平静深色版。
- [generation-loving-missing-tired.json](generation-loving-missing-tired.json)：心动、想你、疲惫亮暗版及心动重试记录。
- [generation-sad-irritated-energetic.json](generation-sad-irritated-energetic.json)：低落、烦躁、元气亮暗版。

统一文件清单 [manifest.json](manifest.json) 保存全部 16 张的尺寸、字节数、SHA-256、透明像素比例、可见边界、提示词记录映射与亮暗轮廓比较。
