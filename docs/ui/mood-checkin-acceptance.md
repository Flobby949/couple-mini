# 心情签到 0.2.0 验收记录

更新：2026-10-23。本轮目标为高保真实现签到区、心情选择和双人月历，完成后端、缓存、联调后提交部署并上传0.2.0体验版。下表区分已经验证与尚未完成，不能以浏览器代替原生验收。

## 设计依据与验收方法

- 首页：[原布艺签到区](images/v3/checkin-original-fabric-mood.png)，保留当前背景、花草、绣边与爱心连线；每人原位独立从头像变心情。
- 选择器：[原八心情设计](images/v3/checkin-mood-concept.png)中间画面；使用实际生产的八种小团子与亮暗变体。
- 月历：[双人上下日历](images/v3/checkin-mood-dual-calendar.png)右侧画面，保持双人同屏，不恢复单人切换。
- 对照以390px移动界面为主，并检查320px与短屏；系统导航、实际日期、账号、积分和历史数据不伪造为示例图数值。几何、层次、图案、交互分别核对，不把差异化真实数据计算成视觉失败，也不把主观评分称为逐像素相似度。

## 已验证

| 范围 | 当前证据 |
| --- | --- |
| 后端 | Go单元、非缓存真实MySQL/Redis集成和race、vet通过；含八值校验、兼容旧请求、重复键/换心情冲突、双人并发、事务回滚、跨日旧回执、月范围与关系隔离。 |
| 后端缓存 | 注入DEL失败后旧字段真实保留，新版本仍立即读到新心情；封存月重新查库、TTL为72小时；通用缓存故障回源测试通过。 |
| 公开图片 | 16张运行PNG的格式、336×336尺寸、字节数和SHA256与清单一致；HTTP缓存头、ETag和304以及非法资源404通过。 |
| 前端 | 最终245项测试与类型检查通过；覆盖月历日期/闰年、账号月份key、确认回执更新、晚到/跨账号/跨日响应保护、八项选择、双人顺序、隐藏页面查询暂停、主题图片切换与错误重试。 |
| 图片缓存 | 同键20次调用仅下载一次、重启恢复、主题/版本/域名区分、2并发、2版本/32文件/4MiB边界、失效/损坏/写盘失败/H5直接URL测试通过。 |
| 浏览器真实联调 | 独立测试数据库与账号，依次验证双头像、伴侣先签到、双方签到、刷新恢复、上下月/空月/漏签/旧无心情记录、亮暗主题、320px无横向溢出。 |
| 断网与恢复 | 停止独立测试API后提交；原心情被锁定、提交禁用，9个展示位仍能显示已缓存图片；恢复后核查absent并原子关闭，重新提交只增加10入池，revision=1，整月只有1条记录。 |
| 资源优化 | 原始素材保持不变；9张运行布纹/连线节省139,281字节。按实际显示尺寸在亮暗底上对比，底板最大归一化MAE0.005514、连线0.000831；该误差只描述素材导出，不是整页还原率。 |
| 生产构建 | 小程序与H5构建通过。小程序28路由、4Tab，主包1,485,214字节，总包1,868,919字节，低于1,500,000主包阈值，无内联图片。产物确认使用生产HTTPS API、不含本地API或开发身份登录入口，素材版本为0c77c677fbaa99cb。 |
| 独立设计复核 | 修复底板覆盖、暗色花草/缝线、大预览尺寸及提示文字叠花草后，最终人工符合度主页94、选择器97、日历96，按35/35/30加权95.65/100。复核无浏览器视觉必修项；不是逐像素相似率，也不包括微信原生验收。 |
| 微信开发者工具 | Stable 2.02.2608080、基础库3.17.5，390×844和320×568模拟器通过。实际选心情并提交后仅本人圆框变开心、入池10分；伴侣提交元气后可见月历自动同步，合计30分、revision42。返回首页两人各自显示正确，关闭弹层不签到且底栏恢复，未来日期禁选、旧无心情签到说明、上下双方详情与小屏滚动均通过。 |
| 微信设备图片缓存 | 首次8张浅色PNG各请求一次；关闭重开不增加请求，重新编译后8张图片从设备usr文件恢复，远端moods请求为0。切暗色新增2张首页图、月历补齐6张，各200；已有图片不重复下载。恢复原390设备、跟随系统外观，并退出隔离账号后准备生产构建。 |

测试账号及所有历史记录仅用于独立本地数据库，未迁入生产。截图中的Flobby/Flora和数据为验收样例。

## 页面截图

| 页面 | 浅色 | 深色 / 小屏 |
| --- | --- | --- |
| 签到区 | [未签到](images/mood-acceptance/home-before-light.jpg) · [单人签到](images/mood-acceptance/home-one-light.jpg) · [双人签到](images/mood-acceptance/home-light.jpg) | [深色未签](images/mood-acceptance/home-before-dark.jpg) · [深色双签](images/mood-acceptance/home-dark.jpg) |
| 心情选择 | [浅色390](images/mood-acceptance/picker-light.jpg) | [深色390](images/mood-acceptance/picker-dark.jpg) · [320×568](images/mood-acceptance/picker-dark-320.jpg) |
| 双人月历 | [浅色390](images/mood-acceptance/calendar-light.jpg) | [深色390](images/mood-acceptance/calendar-dark.jpg) · [320](images/mood-acceptance/calendar-dark-320.jpg) |
| 未知结果 | — | [原请求锁定](images/mood-acceptance/unknown-result.jpg) |

微信开发者工具凭证：[未签到](images/mood-acceptance/native-home-before.jpg)、[原生选择器](images/mood-acceptance/native-picker-light.jpg)、[复开缓存](images/mood-acceptance/native-picker-cache-hit.jpg)、[320与重启缓存](images/mood-acceptance/native-picker-320-cache.jpg)、[单签](images/mood-acceptance/native-home-one-320.jpg)、[双签](images/mood-acceptance/native-home-both-320.jpg)、[320双人月历](images/mood-acceptance/native-calendar-320.jpg)、[旧签到详情](images/mood-acceptance/native-calendar-legacy-320.jpg)、[暗色首页](images/mood-acceptance/native-home-dark.jpg)、[暗色月历](images/mood-acceptance/native-calendar-dark.jpg)。这些是原生小程序运行时模拟器证据，不称为物理手机测试。

## 尚未完成的发布门槛

- commit/push、后端v0.2.0流水线与线上验证。
- 微信0.2.0上传及体验版生效凭证。

只有上述门槛完成后，才将本轮标为已发布。

原生测试使用隔离测试API；最终上传前重新构建生产HTTPS包并核对配置。发布顺序为提交并推送main、推送v0.2.0标签、确认Actions与公网健康/图片路由、最后上传小程序0.2.0并确认体验版生效。
