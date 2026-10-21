# 已实现 API 约定

基址 `/api/v1`；JSON；ID 为字符串；绝对时间带时区；业务日期固定北京时间。返回 `X-Request-ID`，日志不记录请求正文、会话或邀请码。错误形如 `{"error":{"code":"RULES_REQUIRED","message":"请先由双方确认共同规则"}}`。

除登录外都要求 `Authorization: Bearer <token>`。除登录、图片上传和关闭原操作外，POST 还要求 `Idempotency-Key`：16–80 个字母、数字、下划线或连字符，区分大小写。客户端每个已确认意图生成一次，并在发送前持久保存。键在同一操作人下全局唯一，指纹包含方法、路径、规范化 JSON；同键改参数返回 `IDEMPOTENCY_CONFLICT`。回执和关闭标记长期保留。

| 方法、路径 | 请求 / 返回 | 门禁 |
| --- | --- | --- |
| POST `/login` | `{code}`；仅开发环境可用 `{devIdentity}`。返回 `{token, expiresAt, user}` | 无 |
| GET `/context` | `{me, partner, couple, stage, serverTime, businessDate}`；`stage` 为 `binding / rules / ready` | 已登录 |
| POST `/invitations` | `{}` → `{code, expiresAt}`；12 位随机十六进制、24 小时、一次性，数据库只保存摘要 | 已登录且未绑定 |
| POST `/binding` | `{code}` → `{coupleId, boundAt}` | 双方未绑定，不能绑定自己 |
| GET `/rules` | `{dailyLimit, proposals}`，最近 100 份，按创建时间/ID 降序；提议有 `id, proposerId, previousLimit, dailyLimit, status, createdAt` | 已绑定 |
| POST `/rules` | `{dailyLimit: "103.5"}` → 固定内容提议；积分输入采用十进制字符串 | 已绑定 |
| POST `/rules/:id/confirm` | `{}` → `{proposalId, dailyLimit, activatedAt}` | 同一关系的另一方；仅待确认提议 |
| GET `/home` | 一次一致性读取 `{context, points, checkin, todos, milestones}` | 首次规则生效 |
| POST `/checkins` | `{}` → `{date, base, doubleBonus, milestoneBonus, total, doubleDays}` | 首次规则生效 |
| GET `/history` | `{entries}`；最近 100 笔共享池流水，按时间/ID 降序 | 首次规则生效 |
| GET `/operations/:key` | `{status, httpStatus?, response?}` | 仅原操作人，无首次规则门禁 |
| POST `/operations/:key/close` | `{}` → 同上；无需再传幂等键 | 仅原操作人，无首次规则门禁 |

`couple.dailyLimit: null` 表示首次未确认；数值 0 表示有效的零上限。`points` 包含 `balance, earned, dailyLimit, remaining, available, reserved, total`；`remaining=max(0, limit-earned)`，`total=available+reserved`。`checkin` 的 `me / partner` 为当天是否已签到。首页 `todos` 为需要本人确认的规则提议，`orderTodos` 为需要本人接单、兑现、确认收货或处理取消申请的订单；等待对方的订单不放入本人待办，待办不依赖消息。

操作状态：`succeeded` 为原成功回执；`rejected` 为确定未生效；`closed` 为未执行且已关闭；`absent` 为暂无已提交记录，**不能据此判断原请求不会执行**。本实现同步事务处理，尚未提交的事务对结果查询不可见，查询可能返回 `absent`。关闭与执行共用用户行锁：执行先提交则关闭返回原回执；关闭先提交则迟到原请求返回 `OPERATION_CLOSED`。没有自动过期、客户端离线写队列或自动重提未知请求。

不同请求键的重复签到返回 `ALREADY_CHECKED_IN`；原键重复调用始终返回原回执，不是当前首页状态。写成功后刷新读取失败仍保留已完成的写结果，当前状态另读。

积分字段先校验非负十进制文本，再四舍五入，最多六位小数，取整后范围 0–1000000000；拒绝空、负数、科学计数法和越界输入。JSON 请求体上限 16 KiB。

主要业务码：`UNAUTHENTICATED`、`BINDING_REQUIRED`、`RULES_REQUIRED`、`INVITE_INVALID`、`SELF_BINDING`、`ALREADY_BOUND`、`PARTNER_CONFIRM_REQUIRED`、`PROPOSAL_INACTIVE`、`INVALID_POINTS`、`ALREADY_CHECKED_IN`、`IDEMPOTENCY_CONFLICT`、`OPERATION_CLOSED`。5xx 和网络异常均按结果未知处理，不能换键重试。

绑定、规则、签到、订单的事件与业务、流水、成功回执同事务保存。当前只落 Outbox，不宣称通知已经生成或微信已经发送；通知偏好、快照、独立消费事务与消费收据需在消息阶段一起落实。任务与赠送接口尚未创建。

## 小店、图片与购物车

以下业务接口要求首次规则已生效。图片读取仅校验登录及本人/同一关系访问权限，不额外依赖首次规则，以便后续承载门禁页头像。

| 方法、路径 | 请求 / 返回 |
| --- | --- |
| POST `/media` | multipart 字段 `file` → `{fileId, mime, size, width, height}`；最多 5 MiB、PNG/JPEG、单边最多 4096；不信任扩展名/MIME，解码重编码；重试可能形成新的未引用文件，不改变商品或积分 |
| GET `/media/:id` | 带 Bearer 的二进制读取；只允许本人及固定伴侣，返回准确 MIME、`nosniff`、`no-store`，没有公开文件 URL |
| GET `/catalog?view=partner\|mine` | `{products, ownerId, balance}`，默认伴侣店；不返回其他关系的商品 |
| GET `/products/:id` | `{product, balance}`，限本人或伴侣商品 |
| POST `/products` | `{name, description, coverId, price: "0", stock: 3}` → 商品 |
| POST `/products/:id` | 同上；只能编辑本人商品，不更改历史订单 |
| GET `/cart` | `{items, balance}`，按加入时间/商品 ID 降序，保留无库存候选 |
| POST `/cart/:id/add` | `{}`；只允许伴侣商品，重复加入保持一个候选，不扣库存或积分 |
| POST `/cart/:id/remove` | `{}`；只删除本人的该候选 |
| GET `/points/history` | `{entries}`，最近 100 笔本人积分流水，含关联 `orderId`、金额、变动后余额与时间 |

商品字段：`id, ownerId, name, description, coverId, price, stock, createdAt, updatedAt`。名称去首尾空白后 1–80 字，说明最多 2000 字；封面必须已上传且属于本人；价格沿用积分规则。设置库存接受 0–1000000 的整数，取消恢复的库存仍必须完整返还，不按输入上限截断。

## 订单

| 方法、路径 | 请求 / 返回 |
| --- | --- |
| POST `/orders` | `{productId, confirmedPrice: "21"}` → 原下单回执；固定一件一份，下单成功后移除该购物车候选 |
| GET `/orders?role=buyer\|seller&status=&cursor=` | `{items, nextCursor}`；默认我下的单、全部状态；每页 50，按创建时间/ID 降序，游标由上次返回值提供 |
| GET `/orders/:id` | `{order, history, balance, serverTime}`；仅本单双方 |
| POST `/orders/:id/actions` | `{action}` → 本次回执；服务端逐次检查角色、状态及取消申请 |

状态：`pending` 待接单、`fulfilling` 待兑现、`awaiting_receipt` 待确认收货、`completed / rejected / cancelled`。`cancelPending` 独立表达待处理申请；`autoConfirmAt` 仅在本轮有效时返回。`allowedActions` 是当前角色的操作快照，提交时仍重新校验。

动作：店主 `accept / reject / fulfill / approve_cancel / deny_cancel`；下单方 `confirm / reject_fulfillment / request_cancel`；`cancel` 在接单前属于下单方，接单后属于店主并产生原实扣价半额取整罚分。店主可在申请待处理时主动取消并承担罚分。申请待处理禁止兑现提交、确认收货及自动完成；拒绝申请后恢复原阶段，原待确认收货重新计 72 小时。

回执含 `orderId, action, charged, refunded, penalty, buyerBalance, sellerBalance, occurredAt, snapshot`。订单快照含名称、说明、封面文件 ID 和原价；无数量或规格参数。`PRICE_CHANGED` 不创建订单，也不扣资产；`NEGATIVE_BALANCE` 阻止所有订单，包括免费订单。

同一关系读写先获取关系锁和服务端时间，补齐到期自动收货并独立提交，再执行原操作；后续拒绝不能回滚已生效的自动完成。后台每 30 秒及启动时复用同一结算模块，按有效截止时间记历史，重复扫描不产生第二条完成记录。任务尚未开放，未来任务到期退池/罚分须加入同一独立补结算边界，再开放任务与下单组合场景。

新增业务码：`INVALID_IMAGE`、`IMAGE_TOO_LARGE`、`IMAGE_DIMENSIONS`、`INVALID_COVER`、`INVALID_PRODUCT`、`INVALID_STOCK`、`OWN_PRODUCT`、`FORBIDDEN`、`OUT_OF_STOCK`、`PRICE_CHANGED`、`NEGATIVE_BALANCE`、`INSUFFICIENT_POINTS`、`ORDER_STATE_CHANGED`、`INVALID_ACTION`、`INVALID_CURSOR`。文件存在但磁盘暂不可读返回 `MEDIA_UNAVAILABLE`，不等同于文件已被删除。
