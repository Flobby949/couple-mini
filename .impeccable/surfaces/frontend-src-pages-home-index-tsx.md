---
version: 1
slug: "frontend-src-pages-home-index-tsx"
primary_target: "frontend/src/pages/home/index.tsx"
related_targets: ["frontend/src/features/checkin/mood-picker.tsx","frontend/src/features/checkin/checkin-portrait.tsx"]
---

Mode: Operate. Scope: 首页的心情签到台与选择弹层。

用户与伴侣各自每日选一种心情签到；服务端成功后，只替换该人的头像内容。保留当前布艺背景、两角花草、112px紫蓝绣边与原爱心绣线，姓名和框位置不变。完整月历通过底部文字入口进入，首页不新增周历卡片。

八种心情用同一家族的小团子，4×2选择网格、放大预览、名称、选中描边与勾、确认按钮。原请求结果未知时冻结选择并引导核查，不将本地选中态当成签到事实。旧签到无心情保持头像和已签到标志。

图片按实际亮暗scheme选择16个版本，主题色不改变心情语义色。短屏保留所有选择和主操作，缩小预览并隐藏辅助短句；头像框与连线不跟着内容动画缩放。

视觉权威：docs/ui/images/v3/checkin-original-fabric-mood.png；选择弹层参考docs/ui/images/v3/checkin-mood-concept.png。验收看docs/ui/mood-checkin-acceptance.md，原生验收与发布凭证未齐不能标记完整交付。
