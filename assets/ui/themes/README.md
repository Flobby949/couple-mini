# 主题插画

2026-10-21。使用内置 `image_gen` 对已确认的紫色素材作两次定点改色，生成青绿和杏橙透明图集；保留六类对象、原有排布、象牙白织物/纸张、黄色星星及植物。人物头像和商品照片不改色。

- `teal-atlas.png`：青绿原始生成图集，1536×1024，带 Alpha。
- `apricot-atlas.png`：杏橙原始生成图集，1536×1024，带 Alpha。
- 运行 `make assets`，或在 frontend 内运行 `node scripts/theme-assets.mjs`，按六个 512×512 单元提取并匹配原素材可见边界，输出到 `frontend/src/assets/artwork/{teal,apricot}/`。
- 运行时仅打包优化后的 12 张 PNG，不打包原始图集；使用显式包内路径，不通过渲染数据传输 Base64。
- 明暗模式共用该主题的透明插画；表面、文字、控件、图标和签到连接线仍使用各自明暗版本。深色签到底板与绣边沿用现有透明度。
- 验证导出尺寸与原图一致、四周透明、头像框中央透明，实际查看浅色及深色页面。

## 生成提示

两次均指定本地参考图为六张原素材的透明排布图：上排为签到底板、空心绣框、星星罐，下排为完成徽章、空任务、空店。参考图由原 PNG 按原比例居中排入 3×2 单元，无文字，不使用页面设计截图。

**青绿：** Precise-object-edit for a production UI asset atlas. Keep the exact six objects, geometry, scale, positions, margins and 3-column × 2-row grid on a 1536×1024 canvas. Replace lavender/violet material accents with jade/teal (#236D63, #70B4A6, #E4F2EE). Preserve ivory cloth/paper, yellow stars, highlights and olive foliage. Preserve exterior transparency, the hollow frame center and the shop opening. No remaining purple accents, added objects, text, backdrop or layout changes. Each item stays within its 512×512 cell. Transparent background.

**杏橙：** Precise production asset recolor, preserving alpha. Replace violet/purple accents on all six objects with apricot, amber and warm peach (#99501F, #D99B6C, #FFF0E3). Preserve source layout, scales, silhouettes and six 512×512 cells on a 1536×1024 canvas. Preserve ivory fabric/paper, golden stars and green leaves. Empty pixels, ring center, shop window and margins remain fully transparent. No background, glow, ambient backdrop, smoky light, text or extra elements. Transparent isolated PNG assets, no purple accents.

图集预览工具可能将透明区域的 RGB 显示成彩色背景；实际 Alpha 已检查，运行时以透明像素合成。图集文件不用于直接展示页面。
