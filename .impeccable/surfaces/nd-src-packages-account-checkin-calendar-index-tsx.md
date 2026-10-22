---
version: 1
slug: "nd-src-packages-account-checkin-calendar-index-tsx"
primary_target: "frontend/src/packages/account/checkin-calendar/index.tsx"
related_targets: ["frontend/src/features/checkin/calendar.ts"]
---

Mode: Operate. Scope: 双人心情月历二级页。

一眼回顾同一日期的双方心情：周一开始，七列，每个日期上排当前用户、下排伴侣，顶部明确顺序和昵称。保留当前主题体系，去掉单人筛选；点日期只读取本月已取到的详情。

未来日期留白、未签到空心圆、已签到有心情用图、旧签到无心情用中性勾并解释。选择日期有主题色边框与底色，下面两行展示双方昵称、心情和北京时间签到时间。上下月、今天和返回入口明确。

数据按当前关系授权；月范围从创建月到当前月，不补签或修改。图片可缓存，业务历史不持久化到图片缓存；可见时观察服务端revision，隐藏时不轮询。320px和六周月份可垂直滚动，不能横向溢出或把双人压成一人。

视觉权威：docs/ui/images/v3/checkin-mood-dual-calendar.png右侧。交付标准与待完成门槛见docs/ui/mood-checkin-acceptance.md。
