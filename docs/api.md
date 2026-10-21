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

`couple.dailyLimit: null` 表示首次未确认；数值 0 表示有效的零上限。`points` 包含 `balance, earned, dailyLimit, remaining, available, reserved, total`；`remaining=max(0, limit-earned)`，`total=available+reserved`。`checkin` 的 `me / partner` 为当天是否已签到。首页 `todos` 为需要本人确认的规则提议，`orderTodos` 为需要本人处理的订单，`taskTodos` 为需要本人接受、提交、确认或处理取消申请的任务；等待对方的事项不放入本人待办，待办不依赖消息。

操作状态：`succeeded` 为原成功回执；`rejected` 为确定未生效；`closed` 为未执行且已关闭；`absent` 为暂无已提交记录，**不能据此判断原请求不会执行**。本实现同步事务处理，尚未提交的事务对结果查询不可见，查询可能返回 `absent`。关闭与执行共用关系锁（已绑定）及操作人行锁：执行先提交则关闭返回原回执；关闭先提交则迟到原请求返回 `OPERATION_CLOSED`。没有自动过期、客户端离线写队列或自动重提未知请求。

不同请求键的重复签到返回 `ALREADY_CHECKED_IN`；原键重复调用始终返回原回执，不是当前首页状态。写成功后刷新读取失败仍保留已完成的写结果，当前状态另读。

积分字段先校验非负十进制文本，再四舍五入，最多六位小数，取整后范围 0–1000000000；拒绝空、负数、科学计数法和越界输入。JSON 请求体上限 16 KiB。

主要业务码：`UNAUTHENTICATED`、`BINDING_REQUIRED`、`RULES_REQUIRED`、`INVITE_INVALID`、`SELF_BINDING`、`ALREADY_BOUND`、`PARTNER_CONFIRM_REQUIRED`、`PROPOSAL_INACTIVE`、`INVALID_POINTS`、`ALREADY_CHECKED_IN`、`IDEMPOTENCY_CONFLICT`、`OPERATION_CLOSED`。5xx 和网络异常均按结果未知处理，不能换键重试。

绑定、规则、签到、订单、任务及赠送的事件与业务、流水、成功回执同事务保存。当前只落 Outbox，不宣称通知已经生成或微信已经发送；通知偏好、快照、独立消费事务与消费收据需在消息阶段一起落实。

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
| GET `/points/history` | `{entries}`，最近 100 笔本人积分流水，含关联 `orderId / taskId / giftId`（仅一个非空）、金额、变动后余额与时间 |

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

同一关系读写先获取关系锁和服务端时间，补齐到期自动收货并独立提交，再执行原操作；后续拒绝不能回滚已生效的自动完成。后台每 30 秒及启动时复用同一结算模块，按有效截止时间记历史，重复扫描不产生第二条完成记录。伴侣任务到期已加入同一补结算边界，按有效截止时间释放预留及罚分；后续下单失败也不会撤销已到期罚分。关系内操作统一先锁关系再锁操作人。

新增业务码：`INVALID_IMAGE`、`IMAGE_TOO_LARGE`、`IMAGE_DIMENSIONS`、`INVALID_COVER`、`INVALID_PRODUCT`、`INVALID_STOCK`、`OWN_PRODUCT`、`FORBIDDEN`、`OUT_OF_STOCK`、`PRICE_CHANGED`、`NEGATIVE_BALANCE`、`INSUFFICIENT_POINTS`、`ORDER_STATE_CHANGED`、`INVALID_ACTION`、`INVALID_CURSOR`。文件存在但磁盘暂不可读返回 `MEDIA_UNAVAILABLE`，不等同于文件已被删除。

## 任务、预留与赠送

均要求首次规则生效，仅访问当前固定关系。所有 POST 延用原操作指纹和幂等回执；未知结果禁止换键重提。

| 方法、路径 | 请求 / 返回 |
| --- | --- |
| GET `/tasks?kind=joint\|partner&filter=active\|todo\|history&cursor=` | `{items, nextCursor}`；默认伴侣任务/进行中；每页 50，创建时间/ID 降序 |
| POST `/tasks` | `{kind, name, description, reward: "10", deadline?}` → 任务回执；共同任务无截止，伴侣任务必须带未来绝对时间及时区 |
| POST `/tasks/:id` | 同上；仅待接受的发布方可编辑，类型不可变；只调整预留差额，无变化返回 `action: "unchanged"`，不新增业务历史或事件 |
| GET `/tasks/:id` | `{task, history, balance, serverTime, preview}`；预计发放与不可变历史实际结算分开 |
| POST `/tasks/:id/actions` | `{action, correctionDeadline?, cancelRequestId?}` → 本次不可变回执 |
| GET `/pool/reservations` | `{items, history}`；全部当前有效预留（含 0 分）、最近 100 笔预留变动；只转移可用/预留，不代表新入池 |
| GET `/gifts/preview` | `{receiverId, dailyLimit, singleMax, receiverRemaining, sendsRemaining}` |
| POST `/gifts` | `{amount: "10"}` → 不可变赠送记录；接收人固定为伴侣 |
| GET `/gifts` | `{items}`；当前关系最近 100 笔赠送 |
| GET `/gifts/:id` | 单笔不可变赠送记录 |

任务字段：`id, kind, creatorId, partnerId, name, description, reward, status, deadline, correctionDeadline, effectiveDeadline, submittedBy, reserved, cancelRequest, allowedActions, createdAt, updatedAt`。共同任务的 `reward` 为每人约定奖励，预留为两倍；伴侣任务仅执行方奖励。名称和说明沿用商品文本长度限制，奖励允许 0，预算不足时事务整体拒绝。`allowedActions` 只作为界面提示，提交仍重新检查。

状态：`pending` 待接受、`active` 待完成、`awaiting` 待确认；终态为 `completed / rejected / cancelled / expired / timed_out`。动作：`accept / reject_accept / submit / confirm / reject_completion / request_cancel / approve_cancel / deny_cancel`。共同任务任一方提交，由另一方确认/驳回；伴侣任务由执行方提交、发布方确认/驳回。发布方编辑走保存接口，`edit` 仅用于权限快照。

`cancelRequest: {id, requesterId, createdAt} | null` 独立于主状态。申请待处理仍能接受、提交、确认或驳回，不暂停截止时间；另一方审批必须提交当前的 `cancelRequestId`，防止旧界面误批新申请。批准释放全部预留且无罚分；拒绝仅关闭申请，保留最新主阶段与有效截止。任务终态作废未处理申请。

伴侣任务须在有效截止时刻**严格之前**提交；原约定截止不变，驳回必须提供新的未来 `correctionDeadline`，本轮以此为准。及时提交后的 `awaiting` 不再自动超时。未接受到期为 `expired`，只释放；接受后 `active` 到期为 `timed_out`，释放全部预留，并对执行方扣约定奖励一半向上取整，允许负余额，罚分全额入池。自动处理的业务时间为有效截止，处理时间另记；不依赖扫描准点执行。共同任务不限时且没有超时罚分。

任务回执：`taskId, action, name, reward, reserved, released, penalty, penaltyBalance?, awards, occurredAt`。`awards` 每项含 `userId, agreed, actual, unpaid, balanceAfter?`；当前预估省略 `balanceAfter`，实际回执保留结算后的历史余额。确认时按各自北京时间当日剩余额度发放，未发放预留回到可用，不保留次日领取权；共享池只按实际奖励记负支出，释放本身不是入池收入。`GET /history` 的任务收支含 `taskId` 关联。

赠送不扣本人余额或共享池，实际到账计入接收方当天获得额度，与任务共享上限。单次上限按当前每日上限的 20% 四舍五入（103 → 21）；超额请求拒绝，剩余额度不足时仅发放剩余，差额丢弃。每人北京时间每天三次，申请 0 或实际到账 0 也占一次；规则修改不重置次数或已获得额。记录含 `id, senderId, receiverId, requested, actual, discarded, dailyLimit, createdAt`，原键重放不重复占次数或发放。

新增业务码：`INVALID_TASK_TYPE`、`INVALID_TASK`、`TASK_TYPE_LOCKED`、`INVALID_DEADLINE`、`TASK_STATE_CHANGED`、`CANCEL_REQUEST_CHANGED`、`INSUFFICIENT_POOL`、`INVALID_FILTER`、`GIFT_LIMIT`、`GIFT_COUNT_LIMIT`。
