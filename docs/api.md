# 已实现 API 约定

基址 `/api/v1`；JSON；ID 为字符串；绝对时间带时区；业务日期固定北京时间。返回 `X-Request-ID`，日志不记录请求正文、会话或邀请码。错误形如 `{"error":{"code":"RULES_REQUIRED","message":"请先由双方确认共同规则"}}`。

除登录外都要求 `Authorization: Bearer <token>`。除登录、图片上传和关闭原操作外，POST 还要求 `Idempotency-Key`：16–80 个字母、数字、下划线或连字符，区分大小写。业务写入的客户端每个已确认意图生成一次，并在发送前持久保存；授权上报另以持久的 reportId 提供跨请求去重和恢复。键在同一操作人下全局唯一，指纹包含方法、路径、规范化 JSON；同键改参数返回 `IDEMPOTENCY_CONFLICT`。回执和关闭标记长期保留。

| 方法、路径 | 请求 / 返回 | 门禁 |
| --- | --- | --- |
| POST `/login` | `{code}`；仅开发环境可用 `{devIdentity}`。返回 `{token, expiresAt, user}` | 无 |
| GET `/context` | `{me, partner, couple, stage, serverTime, businessDate}`；`stage` 为 `binding / rules / ready` | 已登录 |
| POST `/profile` | `{nickname, avatarId}` → `{id, nickname, avatarId}`；保存本人资料，使用幂等键 | 已登录，无绑定或首次规则门禁 |
| POST `/profile/avatar` | multipart 字段 `file` → `{fileId, mime, size, width, height}`；图片限制同 `/media`，上传后再保存资料引用 | 已登录，无绑定或首次规则门禁 |
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

绑定、规则、签到、订单、任务及赠送的事件与业务、流水、成功回执同事务保存。业务响应不等待通知消费，也不代表微信已经发送；已按冻结偏好及昵称生成站内/微信渠道记录，消费与收据独立于主业务原子提交。

## 用户资料

登录返回的 `user`、启动及首页上下文中的 `me / partner` 均包含 `{id, nickname, avatarId}`。`avatarId` 未设置时为 `""`，前端使用默认插画；已设置时通过带会话头的 `/media/:id` 下载，图片读取失败提供重试。昵称去除首尾空白，最多 40 个 Unicode 字符，不允许换行或控制字符；留空恢复为“微信用户”。保存的头像必须是本人已上传的文件，空字符串恢复默认头像。重新登录不会覆盖已保存的资料。

小程序资料页使用 `Button openType="chooseAvatar"` 取得临时路径，上传取得持久 `fileId` 后再保存 `avatarId`；昵称使用 `Input type="nickname"`，从 `Form` 提交值收集微信填写结果。用户可在绑定页或“我的 → 本人资料行”进入，不强制设置资料。保存后刷新本人会话及页面缓存，伴侣端在重新读取上下文后更新；既有通知保留生成时冻结的昵称。

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

## 消息与逐模板偏好

所有日常消息接口要求首次规则生效，并仅返回本人数据（包括“仅微信”投递历史）。默认每模板 `in_app`，四种渠道为 `in_app / wechat / both / off`；设置只影响之后新业务事件。

| 方法、路径 | 请求 / 返回 |
| --- | --- |
| GET `/notifications?filter=all\|unread&cursor=` | `{items, nextCursor}`；每页 50；按业务发生时间、接收序号倒序 |
| GET `/notifications/unread` | `{count}`；只计本人已入站且未读的消息 |
| GET `/notifications/:id` | 本人站内消息全文；读取本身不标读 |
| POST `/notifications/read` | `{ids: [通知ID]}`，1–200 条明确集合；必须全部属于本人站内消息 |
| POST `/notifications/read-all` | `{}` → `{read}`；在事务的一致性快照内固定当前可见未读 ID 再逐条更新，晚提交或晚生成消息不被旧操作覆盖 |
| POST `/rules/:id/read-notification` | `{}`；特殊门禁：已绑定即可。成功打开具体规则提议后，只标读本人该提议的 R02，不创建缺失站内记录，不开放消息列表 |
| GET `/rules?id=提议ID` | 已绑定可读取同一关系该份具体提议，包括已作废或超出最近 100 条的提议 |
| GET `/notification-preferences` | `{items}`，完整 O01–O12、T01–T12、P01–P03、R01–R03，共 30 项 |
| POST `/notification-preferences/:code` | `{channel}` → `{code, channel, savedAt}`；关系锁下先补齐到期任务后再修改 |
| POST `/notification-authorizations/:code` | `{platformTemplateId, result, reportId}`；result=`accept / reject / ban / filter / fail`；持久稳定 `reportId` 需为16–80字符操作键格式，同一报告换请求键重同步仍只记一次，改内容拒绝 |
| GET `/notification-deliveries?template=P01` | `{items}`，本人该模板最近30笔微信渠道状态，不泄露OpenID、平台凭据或发送载荷 |

消息字段：`id, sequence, template, title, body, target:{type,id}, occurredAt, receivedAt, readAt, deliveryStatus, deliveryReason`。ID/sequence 均为字符串；目标受控为 `order / task / gift / rules / partner / home`，客户端映射到已注册页面并重新校验业务权限。展示全文后标读；门禁重定向不提前标读。历史正文不改写，点击打开业务当前状态，旧通知不恢复旧按钮。

偏好项包含 `code, name, group, channel, wechatAvailable, platformTemplateId, authorization, authorizationAt, reportedRemaining`。可用性仅代表服务配置与映射存在，授权是客户端上报；剩余报告机会不是平台保证。保存微信偏好不会自动弹授权；单模板页面提前加载模板 ID，用户点击时只请求该模板，再单独同步结果。通知设置页与未结束的任务/订单详情另提供批量补充入口，仅选择已开启微信渠道且可用的通知，按平台模板去重，每次最多请求 3 个不同 ID；默认优先剩余次数较少的模板，预计剩余不超过 2 次时轻提示，共用模板不重复累计。批量订阅仅由用户点击触发，不修改接收偏好；结果逐模板持久保存并自动同步，失败后保留稳定 reportId 供重试，兼容原单模板待同步记录。拒绝/禁止会废弃该平台模板未使用的旧接受报告；共享同一平台模板的内部模板共用机会池。

欢迎页恢复已有会话和登录成功后的自动进入，不在自动跳转时请求订阅。首页右上角消息图标左侧提供小型“补充”按钮，点击为最多 3 个已开启微信渠道的可用模板补充；本机有未同步结果时先同步，旧模板结果或未开启渠道则进入通知设置，H5 点击提示须在微信中补充。结果使用短提示反馈，首页内容区不再单列补充卡片。签到、任务发布/编辑与各状态处理、确认下单、订单状态处理及赠送使用点击内的顺手补充：页面可见和偏好刷新时提前读取 `getSetting({withSubscriptions:true})`，只选择微信主开关开启、已记住 `accept` 且已开启微信渠道的模板，按平台 ID 去重后最多 3 个。读取设置和打开页面本身不发起订阅。每次相关业务点击均可补充，没有新增每日补充上限；未记住允许、已拒绝、未配置和 H5 均跳过自动补充，原业务照常执行。

原生订阅请求在点击调用栈内启动，业务请求立即执行，不等待授权结果；授权返回后先保存在本机，业务请求和其结果回调完成后才逐条上报；授权上报使用独立请求和每次请求键，由稳定 reportId 跨请求去重，不占用业务 pending，超时不会阻塞下一次业务。业务结果未确定时保留授权报告，先恢复业务操作再同步；旧报告未处理时不再次申请并覆盖；同账号跨页面的原生请求互斥，旧同步仅清除相同 reportId 的本机记录，其他页面已完成的同步以持久记录为准。订阅失败单独标明为微信提醒补充问题，不当作业务提交失败。账号切换后忽略迟到的授权结果。

当前推荐的合并映射见 `backend/notification-mappings.example.json`：

| 微信模板 | 业务通知 | 共用次数范围 |
| --- | --- | --- |
| 订单状态通知 | O01–O12，共 12 种 | 所有订单进展、拒绝、取消及确认 |
| 待办事项提醒 | T01–T07、T09–T12、R01–R03，共 14 种 | 任务与绑定、共同规则进展 |
| 积分变更通知 | P01–P03、T08，共 4 种 | 伴侣赠送、签到入池、里程碑和任务结算 |

30 种业务通知仍分别保存接收偏好，微信发送按本人及平台模板 ID 共用机会。示例中的三个占位 ID 必须替换为账号真实模板 ID，字段须与所选模板关键词一致。本地真实映射已按微信接口返回的标题、一次性类型及字段逐一核对。合并保留三个原模板 ID，不删除微信后台的旧模板，也不修改既有投递载荷或历史记录；其他旧 ID 的剩余次数无法转移到保留的 ID，切换后需按新共用池重新补充。

站内消费者按事件、订阅者保存收据，通知按事件/接收人/模板唯一；全关仍消费成功。业务事务只读取有效偏好和必要昵称快照、不渲染正文。消费不重读可变商品/任务/额度；模板异常与收据失败使本次消费整体回滚，不回滚已完成业务。订单名称用原订单快照，任务用该次事件名称，实际结果按个人分别渲染。

微信状态：`pending / claimed / sending / succeeded / retry / unavailable / unknown / failed`。`succeeded` 只代表平台接口明确返回成功，不代表用户已读；`retry` 只用于明确失败，最多5次。领取后未进入发送的过期租约可安全恢复；进入发送后崩溃、响应不明或超时为 `unknown`，不自动重发。渠道异常不增加站内消息或改变冻结偏好。

新增业务码：`INVALID_MESSAGES`、`INVALID_PREFERENCE`、`INVALID_AUTHORIZATION`、`AUTHORIZATION_CONFLICT`、`TEMPLATE_UNAVAILABLE`。原幂等/未知结果恢复约定同样适用。

### 消息维护与重放

先备份，再通过仅运维可访问的数据库连接检查 `event_consumptions` 的 `retry / failed`、事件ID、订阅者和次数，以及 `notification_deliveries` 的 `unknown / failed / unavailable` 及原因。日志只记录事件标识和稳定错误码，不包含昵称、正文或平台凭据。

修复模板处理代码后，可针对**已核对的单个事件ID与订阅者**，将 `event_consumptions` 的 `failed` 改回 `retry`、重置次数及下次时间，保留原事件/快照；分发器只重跑消息消费。消费收据与消息同事务，唯一约束防止重复内部通知；不要删除已成功收据，不重跑原下单、发奖或罚分。`legacy_without_snapshot` 的 `skipped` 不重放。

`unknown` 微信记录须先核对平台调用结果；确认已成功则人工记录成功，确认未发出且仍具备订阅机会时才针对该条重新排队，并保留核查记录；无法确认时继续保留 unknown。不可投递与明确耗尽的记录不批量补发。恢复旧数据库备份前先停止应用进程及发送作业，核对备份时间之后可能已发送的记录，保持其 unknown/已成功状态后再恢复发送，避免旧备份导致重复微信提醒。真实账号恢复演练仍待部署阶段。
