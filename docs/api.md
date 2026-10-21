# 第一轮 API 约定

基址 `/api/v1`；JSON；ID 为字符串；绝对时间带时区；业务日期固定北京时间。返回 `X-Request-ID`，日志不记录请求正文、会话或邀请码。错误形如 `{"error":{"code":"RULES_REQUIRED","message":"请先由双方确认共同规则"}}`。

除登录外都要求 `Authorization: Bearer <token>`。除登录和关闭原操作外，POST 还要求 `Idempotency-Key`：16–80 个字母、数字、下划线或连字符，区分大小写。客户端每个已确认意图生成一次，并在发送前持久保存。键在同一操作人下全局唯一，指纹包含方法、路径、规范化 JSON；同键改参数返回 `IDEMPOTENCY_CONFLICT`。回执和关闭标记长期保留。

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

`couple.dailyLimit: null` 表示首次未确认；数值 0 表示有效的零上限。`points` 包含 `balance, earned, dailyLimit, remaining, available, reserved, total`；`remaining=max(0, limit-earned)`，`total=available+reserved`。`checkin` 的 `me / partner` 为当天是否已签到。首页待办当前仅包含需要本人确认的规则提议，不依赖消息。

操作状态：`succeeded` 为原成功回执；`rejected` 为确定未生效；`closed` 为未执行且已关闭；`absent` 为暂无已提交记录，**不能据此判断原请求不会执行**。本实现同步事务处理，尚未提交的事务对结果查询不可见，查询可能返回 `absent`。关闭与执行共用用户行锁：执行先提交则关闭返回原回执；关闭先提交则迟到原请求返回 `OPERATION_CLOSED`。没有自动过期、客户端离线写队列或自动重提未知请求。

不同请求键的重复签到返回 `ALREADY_CHECKED_IN`；原键重复调用始终返回原回执，不是当前首页状态。写成功后刷新读取失败仍保留已完成的写结果，当前状态另读。

积分字段先校验非负十进制文本，再四舍五入，最多六位小数，取整后范围 0–1000000000；拒绝空、负数、科学计数法和越界输入。库存暂未开放。请求体上限 16 KiB。

主要业务码：`UNAUTHENTICATED`、`BINDING_REQUIRED`、`RULES_REQUIRED`、`INVITE_INVALID`、`SELF_BINDING`、`ALREADY_BOUND`、`PARTNER_CONFIRM_REQUIRED`、`PROPOSAL_INACTIVE`、`INVALID_POINTS`、`ALREADY_CHECKED_IN`、`IDEMPOTENCY_CONFLICT`、`OPERATION_CLOSED`。5xx 和网络异常均按结果未知处理，不能换键重试。

绑定、规则、签到的事件与业务、流水、成功回执同事务保存。本轮只落 Outbox，不宣称通知已经生成或微信已经发送；通知偏好、快照、独立消费事务与消费收据需在消息阶段一起落实。每个已绑定用户已有账户与空店，任务和商品接口尚未创建。
