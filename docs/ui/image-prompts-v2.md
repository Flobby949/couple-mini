# UI v2 图稿生成记录

工具：内置 image_gen。参考图：`images/screens-overview-v3.png`，已读取并检查。各图为静态设计评审图，非实现截图。

## 共用视觉约束

```text
Use case: ui-mockup. Create a high-fidelity Chinese WeChat mini-program UI design review board for a private couple app. The supplied image is the ESTABLISHED VISUAL REFERENCE, not a background to paste. Extend its chosen A 双人签到台 world faithfully. Cool white #F6F7FC, deep aubergine #29223B text, iris #6752A3 primary actions, pale lavender selections, tiny muted apricot accents for the other person. Crisp legible Simplified Chinese system sans, realistic mobile scale, tidy 16px-equivalent gutters, functional layout and generous group separation. Signature paired stitched illustrated avatars only in the check-in/relationship feature; other UI is flat, clean, no glass, no glossy 3D, no heavy shadows or gradients. Refined consistent outline icons. Screens are complete flat rectangular mobile artboards with native 09:41 status bar and WeChat capsule, not physical phone hardware. White 4:1 equivalent button labels, body copy dark enough to read. Large high-resolution landscape board, equal 390x844-equivalent screens with wide enough clean gutters, no overlaps or cropped buttons, extremely sharp Chinese text. A restrained title outside screens and short screen labels below. Outside footer: "UI设计稿 · 所有人物、商品与数值均为示例". Only top-level screens have exactly FOUR bottom tabs: 首页 / 任务 / 购物 / 我的. All deeper screens have back navigation and safe-area bottom actions, NO bottom tabs. No currency signs, real payment, shipping, address, chat, anniversaries, streaks, recharge, store income, quantity steppers or bulk checkout. Points always use 积分. Names 小满 and 阿宇 and avatars are fictional examples. Do not add features, actions or facts not requested.
```

## 01-main-pages · 四个主页面

```text
FOUR screens in one row. Board title "我们的日常 / 四个主页面".
1 首页, selected home tab. Header "今天，也一起" with bell. Main paired stitched badge check-in scene, woman 小满 "我 · 待签到" has NO tick, man 阿宇 "阿宇 · 已签到" has a tick. Label "双人签到台", small "累计双人签到 12 天". Large primary "签到入池 +10"; helper "两人都签到，再入池 10 积分". Pool row "共同积分池 260 积分" "可用 200 · 已预留 60". Two small metrics "我的积分 68" and "今日已获得 35 / 100", note "剩余 65". Compact section "今日待办" with two row items "一起散步30分钟" "任务 · 待我确认" and "抱抱五分钟" "订单 · 待我接单", each arrow. Bottom milestone strip "下一站 30 天 · +100 入池". Do not fit large decorative scenes at cost of reading.
2 任务, selected task tab. Header plus labeled "+ 新建". Type segmented "共同任务 / 伴侣任务", common selected. Compact pool available200 reserved60 row. Filter "待我处理 / 进行中 / 历史", first selected. One generous task item "一起散步30分钟", "待我确认", "每人 20 积分 · 不限时", "阿宇已提交完成", primary "查看并确认". Second item "周末一起做饭", "待我接受", "每人 10 积分 · 不限时", "阿宇邀请你一起完成", primary "查看邀请". Whitespace intentional, no fake stat dashboards.
3 购物, selected shopping tab. Header "阿宇的小店". Avatar summary and "我的余额 68 积分". A 2-column grid of four tasteful warm photographic cover crops, interactions only: "抱抱五分钟" 0积分 库存6, "肩颈按摩" 21积分 库存2, "陪打两局" 20积分 库存3, "一起吃晚饭" 50积分 库存1. Small outline add-to-cart controls. Page-contained cart dock ABOVE navigation: "购物车 · 2 个候选", "每次选 1 件，固定 1 份", primary "查看购物车"; do not total candidate prices.
4 我的, selected mine tab. Small relationship profile "小满" and 阿宇 avatar with chevron to settings. Plain points panel 68 积分 / 今日已得35/100. "我的订单" with segmented "我下的单 / 我收到的", counts list icons "待接单 / 待兑现 / 待确认 / 全部". Menu rows "我的小店 / 积分明细 / 伴侣设置 / 共同规则 / 消息通知". No duplication or unsupported sales figures. Footer note near bottom "我们的两人小店".
Make four screens look like a coherent product, mature warm and compact, not pastel collage.
```

## 02-onboarding-rules · 绑定与首次规则确认

```text
THREE portrait screens in one landscape row. Title "从两个人，到共同的约定". No bottom tabs.
1 "邀请伴侣". Small paired stitched avatar motif, heading "把我们的日常，放在一起". Explanatory "邀请码仅用于绑定你们两个人". White block "我的邀请码" and clearly fictional "F7K9M2" with "复制邀请码". Primary "我有邀请码" lower. Footnote "绑定后暂不支持解绑或换绑". No regenerating or expiry control because those rules not defined.
2 "输入邀请码". Heading "和伴侣连接". Normal labeled field "伴侣的邀请码" containing "F7K9M2", helper "由对方在邀请页生成". Plain explanation before primary: "确认绑定后，进入共同规则设置". Primary "确认绑定". Footnote "绑定后暂不支持解绑或换绑". No form validation invented code length, no extra permission checkbox, no avatars falsely looked up.
3 "确认共同规则". Two avatars, "阿宇提出的首次约定", large label "每日获得上限" value "100 积分 / 人", note "双方相同，各自独立累计". Three concise rules rows "签到积分进入共同积分池" / "任务与赠送计入每日额度" / "退款不占每日额度". Muted text "0 积分上限也可生效". Lavender compact banner "确认后开始使用，积分池初始 100 积分，个人初始 0 积分". Bottom secondary "另提方案", primary "确认这份约定". Viewer is 小满, must never self-confirm own proposal.
Outside footnote "100 为示例提议，由双方共同确定".
```

## 03-task-flow · 任务创建与完成

```text
FOUR screens, board title "任务 / 把约定说清楚". No bottom tabs. Screen captions explicitly separate role and scenario.
1 "新建任务", role 发起人. Type segmented "共同任务 / 伴侣任务", partner selected. Short note "邀请阿宇完成". Labeled fields "任务名称" filled "整理一下书桌"; multiline "完成说明" filled "整理桌面和抽屉，一起留出舒服的空间"; "奖励积分" filled20; "截止时间" "2026-10-22 20:00:00", "北京时间". Budget line "可用 200 · 本次预留 20". Note "需对方接受；接受后约定锁定". Sticky primary "发布并预留 20 积分".
2 "任务详情", caption 执行人·取消申请中. Title "整理一下书桌", badge "进行中", reward20, exact cutoff "2026-10-22 20:00:00 北京时间". Plain description. A distinct amber inline panel "取消申请待对方处理" and "申请不会暂停截止时间，仍可提交完成". Timeline two compact rows 已接受 / 已申请取消. BOTTOM main "提交完成" stays active. NO frozen deadline, no confirm own cancellation, no repeated cancel control.
3 "确认任务完成", caption 确认人·共同任务. Title "一起散步30分钟", tag共同任务, "阿宇已提交完成", "每人约定奖励 20 积分". Two settlement rows "小满 · 今日剩余 10 · 预计到账 10" and "阿宇 · 今日剩余 50 · 预计到账 20". Note "预计 10 积分释放回池；以确认时额度为准". Bottom secondary "需要补正", primary "确认完成". Note no deadline for common tasks.
4 "任务已完成", caption 结算结果. Restrained lavender check seal, title "一起散步30分钟". Result two distinct rows "小满 实际到账 10 积分" / "阿宇 实际到账 20 积分". Plain summary "约定共 40 · 实际发放 30 · 释放回池 10". Explain "未到账部分受今日额度限制，不再补发". Secondary "查看任务记录" and bottom "返回任务". No claim submission itself pays rewards.
```

## 04-shopping-checkout · 商品购物车与改价确认

```text
THREE screens, title "购物 / 一次兑现一个小心愿". No bottom tabs on product or confirmation; middle is shopping root with cart drawer and tabs obscured by drawer.
1 商品详情. Large warm real-photo crop of neck massage, title "肩颈按摩", price "21 积分", "库存 2 份". Owner 阿宇. Section "兑现说明" text "放下手机，给你十分钟的轻松。力度和时间由我们一起商量。". Facts "每单固定 1 份" "我的余额 68 积分". Bottom secondary "加入购物车", primary "立即下单".
2 购物车 is a bottom sheet over dimmed shopping page, show 70% sheet with header "购物车 · 2 个候选". Helper "一次选一个商品，固定兑换一份". TWO items radio buttons, first selected "肩颈按摩 21 积分 库存2", second unselected "抱抱五分钟 0 积分 库存6". Small "移除" per row. No quantities, no checkboxes, no select-all, no total. Footnote "加入购物车不占积分或库存". Bottom "本次 21 积分" and primary "确认所选商品".
3 确认下单. Same selected product shoulder massage thumbnail. An INLINE change alert "价格已更新" showing old "21 积分" struck through and arrow "30 积分", helper "请确认新价格后再下单". Breakdown "兑换数量 1 份" / "本次扣除 30 积分" / "当前余额 68 积分" / "下单后余额 38 积分". Note "下单即扣积分与库存，等待店主接单". Secondary "暂不下单". Primary explicit "确认以 30 积分下单". Do not auto-confirm, do not claim payment, do not add address or date booking.
```

## 05-order-flow · 订单兑现与取消

```text
FOUR screens, board title "订单 / 每一步，都有明确回应". No bottom tabs.
1 "我的订单". Segmented "我下的单 / 我收到的", my placed selected. State tabs "全部 / 待接单 / 待兑现 / 待确认". Three item rows with thumbnail title price and status, "肩颈按摩 21积分 待确认收货", "抱抱五分钟 0积分 待接单", "陪打两局 20积分 待兑现". Primary on first row "查看并确认". No aggregate sales.
2 "订单详情", caption 下单方·待确认收货. Heading "等你确认这份心意", tag "待确认收货". Product shoulder massage21 "实扣 21 积分 · 1 份". Owner "阿宇已提交兑现". Box "自动确认时间 2026-10-24 20:00 北京时间". Helper "驳回后回到待兑现；再次提交重新计时". Quiet text "申请取消". Bottom secondary "驳回兑现", primary "确认收货". The order snapshot price is21.
3 "订单详情", caption 下单方·取消申请中. Same product 21. Clear amber status "取消申请待处理". Large concise "等待阿宇处理你的申请". Two rules "期间不提交兑现" and "期间不自动确认". Action disabled "等待店主处理". Timeline ordered submitted / cancellation requested. Do not offer withdraw or duplicate cancel. Supporting "同意后退还 21 积分，返还 1 份库存".
4 "订单详情" with bottom destructive confirmation sheet, caption 店主·主动取消. Behind sheet 待兑现. Sheet title "确定取消这笔订单？". Product21. Exact rows "退还对方 21 积分" / "返还库存 1 份" / "你的取消罚分 11 积分" / "你的余额 5 → -6". Explain "罚分进入共同积分池，余额可扣为负数". Contrast two buttons "继续兑现" and "确认取消并扣 11 积分". This is seller ACTIVE cancellation, not agreeing to buyer request; don't confuse those.
```

## 06-store-partner · 小店管理伴侣设置与赠送

```text
FOUR screens, title "我的 / 经营小店，也照顾彼此". No bottom tabs.
1 "我的小店". Avatar 小满, title "小满的小店". Meaningful empty state small shelf outline illustration not toy3D. "你的第一份心意，还没上架". Text "添加一张封面，写下你愿意兑现的小事". Primary "+ 新建商品". Note "商品由你创建，没有系统预置商品". NO revenue stats or unsupported publish toggle.
2 "编辑商品". Cover required label "商品封面 *" with warm photo of two adults cuddling and small "更换图片". Fields "商品名称" "抱抱五分钟"; "积分价格" "0 积分"; "库存" "6 份"; "描述与兑现说明" "一个认真、放下手机的拥抱。". Helper "0 积分也会占用一份库存". Footer note "修改不会改变已有订单的约定". Primary "保存商品". No unavailable scheduling or category settings.
3 "伴侣设置". Paired small avatars 小满↔阿宇. Plain "已绑定". Menu "赠送积分" / "共同规则" / "查看伴侣小店". Read-only information "绑定关系". Footer "当前版本不提供解绑或换绑". No romantic relationship duration invented or editing partner profile.
4 "赠送积分". Recipient 阿宇 avatar. Field "赠送积分" value20. Data "本次最多 20 积分" "今日还可赠送 2 次" "对方今日剩余额度 10". Result preview "预计到账 10 积分", "另 10 积分不发放、不入池、不补发". Quiet explanation "不扣你的余额或共同积分池；0 积分赠送也计一次". Primary "确认赠送 20 积分". Label preview not guaranteed. No transfer language. All numeric sample limits are illustrative not fixed rules.
```

## 07-rules-notifications · 共同规则消息与逐项设置

```text
FOUR screens, title "规则与消息 / 共同决定，各自设置". No bottom tabs.
1 "共同规则". Current card "当前每日获得上限 100 积分 / 人", "双方相同，各自独立累计". Outline "+ 提出新方案". Heading "待确认的提议". Two rows both 阿宇提出, "100 → 0 积分" and "100 → 120 积分", each "查看提议". Information "一份确认后，其余待确认提议自动作废". Fixed rule disclosure "签到与里程碑规则（系统固定）". Do not edit proposals in place, no reject action nonexistent.
2 "消息中心". Header "全部已读". Filters "全部 / 未读". Four different chronological rows with subtle type line icons: "请确认任务完成" "阿宇提交了《一起散步30分钟》的完成结果" "今天 19:40"; "请确认兑现结果" "《肩颈按摩》等待确认" "今天 19:30"; "请确认共同规则" "阿宇提议将每日获得上限调整为0积分" "今天 18:00"; "双人签到完成" "今天基础签到及双人奖励共30积分已入池" "今天 09:41". First unread dot. No chat bubbles or replies.
3 "消息通知". Intro "只设置你自己的接收方式". Small section note "按每一种通知分别设置". Group heading "任务 · 12 项". Five rows "新任务待接受 / 任务已更新 / 任务已接受 / 任务完成待确认 / 任务取消待处理", each right label "仅站内 >". Below compact group headers "订单 · 12 项", "赠送与签到 · 3 项", "绑定与规则 · 3 项". NO group toggle and no master mute. Show default 仅站内.
4 "接收方式" detail for "任务完成待确认". FOUR radio choices exactly "仅站内 / 仅微信 / 站内和微信 / 全部关闭". 仅站内 selected. Description under 微信 choices "微信提醒还需可用模板和订阅授权". Bottom information "修改只影响后续消息，历史消息与待办不变". Primary "保存设置". No fake promise successful authorization, don't silently switch channels.
Keep all lists clear, hierarchy tight, plenty of room.
```

## 08-points-checkin · 积分池个人明细与签到里程碑

```text
THREE screens, title "积分 / 每一分都有来处". No bottom tabs.
1 "共同积分池". Large but restrained total "260 积分", split "可用 200" and "任务已预留 60". Explanation "用于支付任务奖励，与个人余额分开". Segmented "流水 / 预留明细", reservations selected. Two row "一起散步30分钟" "共同任务 · 每人20" reserved40; "整理一下书桌" "伴侣任务 · 奖励20" reserved20. Total exactly60. Footer explanatory "任务取消或奖励未全额发放时，未用预留释放为可用积分". No spending pool personally.
2 "积分明细". Current balance68. Plain quota "今日已获得 35 / 100 · 剩余65", helper "仅任务奖励和伴侣赠送计入每日额度". List with labeled illustrative events carefully adds to68: "任务完成 +20" today10:00; "伴侣赠送 +15" today09:50; "订单取消退回 +21" today09:30; "兑换肩颈按摩 −21" today09:00. Group small "此前余额 33". Include mini explanation "退款不计入今日额度". No signup income, gift expense or store revenue. No currency icons.
3 "累计双人签到". Two compact illustrated avatars both ticked. Headline "一起签到 12 天". Explicit "累计天数，漏签不清零". Small today row "今日两人已签到 · 基础共30积分入池". Vertical milestone rail "7 天 +30 积分 已达成" / "30 天 +100 积分 还差18天" / "100 天 +300 积分" / "365 天 +1000 积分". Muted "每档仅奖励一次，全部进入共同积分池". Footer no action needed "返回首页" outline. No continuous streak text or editable milestones. Footer outside note "不同画面展示独立示例状态".
```

## 局部校正

校正前已逐图查看；只修正影响产品含义或字段约束的内容，保留整体视觉与结构。所有最终图均另存于项目的 `images/v2/`，未覆盖 v1 图稿。

### 02-onboarding-rules

```text
Use case: precise-object-edit. Edit this existing THREE-SCREEN UI BOARD with only one local correction in the FIRST screen (邀请伴侣). This screen is before binding, so the other person's identity is not yet known. Keep the woman's avatar, change her name from 小满 to 我. Replace ONLY the man portrait in that FIRST screen with a neutral lavender outline-person placeholder inside the same stitched circular badge, and change its name from 阿宇 to 伴侣. Do NOT alter the avatars or names in the THIRD screen, which is after successful binding and correctly shows 小满 and 阿宇. Keep all other layout, text, invite code, buttons, colors and pixel positions unchanged. No cropping.
```

### 03-task-flow

```text
Use case: text-localization. Edit this existing FOUR-SCREEN task UI board. Make only these local cleanup edits: In FIRST screen remove the tiny invented character counters "6/30" and "18/200" beside the task-name and description labels; preserve the labels and all input text. In SECOND screen change the two timeline dates from "2025-10-20 17:32" to "2026-10-20 17:32", and from "2025-10-21 14:18" to "2026-10-21 14:18". Preserve the deadline "2026-10-22 20:00:00". Everything else must remain exactly as it is: four screen compositions, names, cancellation banner, active submission button, settlement 10/20/30/40, typography, spacing and colors. Do not add other text or crop.
```

### 04-shopping-checkout

```text
Use case: text-localization. Edit this existing THREE-SCREEN shopping UI board. In the RIGHTMOST screen, 确认下单, the TOP product summary card still incorrectly shows the outdated "21 积分". Change ONLY that current price in that top card to "30 积分" using the same font and purple style. Keep the old crossed-out 21 in the amber price-change alert exactly as it is; the alert must still show 21 → 30. Keep the first and middle screens' prices at21 because they depict the earlier state. Also remove ONLY the three tiny carousel dots on the bottom of the large photo in the FIRST screen, because this product has one cover, not a carousel. Preserve all other text, photos, math, layout and buttons, including 68 balance,38 remaining and 确认以30积分下单. No cropping.
```

### 06-store-partner

```text
Use case: text-localization. Edit this existing FOUR-SCREEN UI board with precisely TWO tiny deletions in the SECOND screen 编辑商品: remove the invented character counter "6/20" on the right side of the 商品名称 input and remove "12/100" at the lower-right of the 描述与兑现说明 textarea. Fill only those tiny areas with the same input background. Do not remove either input or its content. The maximum lengths have not been specified. Preserve every other label, all four screens, avatars, photos, 0积分/6库存 and the gift calculations, layout, font sizes, and colors. No other edits and no cropping.
```

### 07-rules-notifications

```text
Use case: text-localization. Edit this existing FOUR-SCREEN UI board with exactly ONE local copy correction on the FIRST screen 共同规则. In the very bottom explanation panel under 签到与里程碑规则（系统固定）, replace the first text line "签到、连续签到及里程碑奖励的规则" with "签到、累计双人签到及里程碑奖励规则". The product counts cumulative two-person days, never a consecutive streak. If needed wrap naturally within that same panel; keep the following lines about system-fixed rules and applying to both people. Preserve all other text and all four screens exactly, including 100→0,100→120,12/12/3/3 counts, four channel choices, settings states and composition. No other edits and no cropping.
```

## 最终文件

| 图稿 | 采用的生成输出 |
| --- | --- |
| [01-main-pages](images/v2/01-main-pages.png) | `exec-726726b7-ad0e-4c00-98b5-93522c1ddcc1.png` |
| [02-onboarding-rules](images/v2/02-onboarding-rules.png) | `exec-463cc5f1-0f64-4a48-84b0-7dee2dfa0741.png` |
| [03-task-flow](images/v2/03-task-flow.png) | `exec-dccb7a00-ad57-426b-810f-c3c394d64e7d.png` |
| [04-shopping-checkout](images/v2/04-shopping-checkout.png) | `exec-547640a3-a752-49e2-9f7e-94ae05358824.png` |
| [05-order-flow](images/v2/05-order-flow.png) | `exec-1555d8df-8478-4ecc-9b70-05cb894a2651.png` |
| [06-store-partner](images/v2/06-store-partner.png) | `exec-723897fc-f975-4dd7-90bc-7727d2cce8bb.png` |
| [07-rules-notifications](images/v2/07-rules-notifications.png) | `exec-06c6ac36-d517-4d19-8c4a-d1102be00b07.png` |
| [08-points-checkin](images/v2/08-points-checkin.png) | `exec-268bd8a1-1257-4c21-8587-2c331c7089f6.png` |

## 独立复核后的导航校正

### 05-order-flow

```text
Use case: precise-object-edit. Edit this existing FOUR-SCREEN order UI design board with exactly ONE navigation correction. On the FIRST screen 我的订单, add a clear dark-purple back chevron at the top left of the content navigation row, and move the existing 我的订单 title slightly right to give it room. Match the back chevron on screens two and three. This is a second-level screen reached from 我的, so it needs back navigation. Do NOT add bottom tabs. Preserve all other labels, dates, prices, cards, buttons, three other screens, layout and canvas. No other edits and no crop.
```

### 06-store-partner

```text
Use case: precise-object-edit. Edit this existing FOUR-SCREEN UI design board with one local navigation correction. On the FIRST screen 小满的小店, add a clear dark-purple back chevron at top-left of the content header and shift 小满的小店 title slightly right so it doesn't collide. Match the back chevrons on the other three screens. It returns to 我的. Do NOT add tabs. Preserve every other element, the empty-state illustration, form values and descriptions, avatars, gift math, labels, other three screens and canvas. Do NOT reintroduce character counters. Keep the board's bottom example-content caption if present; if absent, restore a discreet single line OUTSIDE all screens at the very bottom: UI设计稿 · 所有人物、商品与数值均为示例. No cropping.
```

### 07-rules-notifications

```text
Use case: text-localization. Edit this existing FOUR-SCREEN UI board with one localized affordance correction in the THIRD screen 消息通知. Its task group header currently reads 任务 · 12项 with only an unlabeled right chevron; five preview rows follow. In that SAME header row, add the explicit right-aligned small purple action text "查看全部 12 项 >". Keep the left group title "任务" and avoid duplicating 12项 on the left if space is tight. This action opens the complete list of all 12 task notification templates. Do NOT remove any of the five preview rows. Keep the lower 订单12项 / 赠送与签到3项 / 绑定与规则3项 group entrances. Preserve every other screen, the corrected 累计双人签到 wording, all four channel radio choices, math, colors, positions and overall canvas. No other edits and no crop.
```
