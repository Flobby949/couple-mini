# FloFlo

Flobby 和 Flora 的小小日常。

永久无真实金钱的两人小店。产品规则见 [PRD](docs/PRD.md)，前端分层与实施顺序见 [前端架构](docs/frontend-architecture.md)。

当前已完成四轮开发：登录、绑定、共同规则与签到；封面、商品、购物车与订单；两类任务、奖励预留与结算、独立取消申请、到期处理及伴侣积分赠送；消息中心、30 个逐模板提醒偏好、事件消费及微信订阅投递适配。没有预置商品或个人初始积分。

“我的 → 外观与主题色”可设置跟随系统/浅色/深色，以及鸢尾紫、青绿、杏橙；默认跟随系统并使用紫色，选择仅在当前设备保存。按钮、状态、输入与原生导航、TabBar 共用主题；原始插画不反色。

## 本地启动

已验证环境：Go 1.26.4、Node.js 22.19.0、pnpm 10.24.0、MySQL 8.4.4、Redis 8.8.0。此阶段只需已有 MySQL 和 Redis，无需额外 Docker 容器。

1. 新环境先创建独立数据库：

   ```sh
   mysql -u root -p -e 'CREATE DATABASE couple_mini CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'
   ```

2. 配置并启动后端：

   ```sh
   cp backend/.env.example backend/.env
   # 编辑 backend/.env 中的 MYSQL_DSN 等配置。
   make backend
   ```

   当前工作区已有本地 `.env` 和数据库，可直接启动。该文件被 Git 忽略，示例文件不含真实凭据。服务默认只监听 `127.0.0.1:8080`，启动时自动执行版本化迁移。`GET /health/live` 检查进程，`GET /health/ready` 检查 MySQL 和 Redis。

3. 新终端启动前端：

   ```sh
   cd frontend
   pnpm install --frozen-lockfile
   cp .env.example .env
   pnpm dev:h5
   ```

   打开 [本地预览](http://localhost:10086/)。开发登录输入不同且固定的英文身份，例如 `alice`、`bob`。两个浏览器或独立浏览器配置分别登录，可测试邀请、规则和签到。H5 会话按同源存储；同一浏览器多个标签共享登录，不能当作两个独立账号。

`DEV_LOGIN` 仅允许 `APP_ENV=development` 且后端监听回环地址；前端生产构建会删除开发登录入口。开发身份不代表真实微信身份。关闭浏览器不清空已绑定关系，需要继续使用同一个身份；第一版没有解绑功能。

## 微信小程序

```sh
cd frontend
pnpm dev:weapp
# 或 pnpm check:weapp
```

在微信开发者工具导入 `frontend/`，小程序根目录为 `dist/weapp/`。`project.config.json` 已配置当前小程序 AppID；后端通过本地 `.env` 配置 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`，客户端与服务端 AppID 必须一致。使用本机 HTTP API 联调时，在被 Git 忽略的 `project.private.config.json` 中设置 `setting.urlCheck=false`；共享工程配置仍开启校验。

真机使用微信可访问的 HTTPS API 域名，并配置小程序合法请求域名；在前端 `.env` 设置 `TARO_APP_API_BASE`。服务器关闭开发登录再部署。服务端用微信 code 换取 OpenID，Redis 保存七天有效的自有会话，平台 session_key 不返回客户端。真实微信账号已在开发者工具中完成页面登录、会话建立及未绑定跳转；后端 HTTPS 已部署，开发版 `0.1.3` 已接入线上 API；微信合法域名由用户手动配置，手机登录和兼容性仍待验证，开发者工具不能替代真机检查。

头像昵称可从绑定页“设置我的头像和昵称”或“我的”中的本人资料行设置。小程序接入微信头像选择与昵称填写，用户主动选择并保存后，全站和伴侣端读取保存的资料；没有设置时使用默认头像和“微信用户”。重新登录保留资料。头像上传、昵称填写及键盘交互仍需微信真机验收。

头像及封面还需配置小程序的合法上传、下载域名。图片仅接受 PNG/JPEG、最多 5 MiB、宽高不超过 4096 像素；服务端解码重编码，以随机文件 ID 保存到 `MEDIA_ROOT`（默认 `backend/uploads/`），不公开静态目录。前端通过带会话的受控下载显示图片。商品换封面不会覆盖原文件，历史订单继续引用原图；备份须同时包含数据库和该目录。本轮没有自动清理未引用图片，维护时不得删除用户头像、商品或历史订单引用的文件。

## 验证

```sh
make check
make integration
```

`make check` 运行 Go 单测与 vet、前端类型检查与单测，以及小程序/H5 生产构建；小程序额外检查路由、资源路径、主题图标、WXSS 选择器和包体上限。`make integration` 读取 `backend/.env`，要求 MySQL 账号有临时建库和删库权限；每次创建随机 `couple_test_*` 数据库，测试结束只删除该库。Redis 只清理测试创建的会话键，不使用 FLUSHDB，不修改开发库数据。

集成覆盖：并发绑定、原子初始化、门禁与对象权限、上限 0、负数与越界、同键并发重放/参数冲突、每日签到唯一、北京时间跨日、累计里程碑、规则修改不重置已得、操作关闭与迟到请求竞争、Outbox 写失败整体回滚、积分池与流水核对。

小店/订单新增覆盖：私有封面权限与格式限制、购物车不占资产、负余额禁止免费下单、并发扣库存、原价快照与换图后历史可读、拒单/取消原额退款、21 分罚 11 分并可扣负、取消申请暂停自动确认、拒绝取消重给三天、驳回兑现废弃旧计时、到期结算不被后续失败操作回滚。订单自动确认及伴侣任务到期在启动及每 30 秒扫描一次，也在关系读写前独立补齐，生效时间仍取原截止时刻。

任务/赠送新增覆盖：共同任务双倍预留、编辑只调整差额、0 奖励/0 可用预算、独立取消与主流程竞争、未来补正期限、待确认免超时、未接受到期无罚分、接受后半额向上取整罚分、任务和赠送共享每日额度、每人每天三次（含 0 分）及超额丢弃、并发终态唯一、Outbox 失败完整回滚。跨操作人的任务确认与赠送并发集成连续五轮通过，统一先锁关系再锁操作人，避免外键检查与账户更新死锁。前端累计 79 项单测，含六种外观切换、持久恢复、系统主题事件与透明插画资源检查。

消息新增覆盖：30 模板文案、逐接收人实际结果、昵称与偏好冻结、双渠道内部去重、消费与收据原子提交、故障重试不重跑业务、全部已读后旧事件晚到仍未读、首次规则的限定标读、截止后先结算再修改偏好、授权报告跨请求去重、投递租约恢复及未知结果不自动重发。独立浏览器验收范围见实施记录。

小程序剩余页面、消费分支及导航修复见 [原生验收记录](docs/mini-program-acceptance.md)。

当前逐能力实现、页面实测及真机待办见 [功能与验收状态](docs/acceptance-status.md)。主题插画的原始图集、提示及重复导出方式见 [主题素材](assets/ui/themes/README.md)。

## 微信提醒配置

内部 30 个编号与微信模板 ID 独立。默认全部仅站内；仅微信、双渠道或关闭均可单独保存。微信凭据及真实模板未配置时，界面明确不可用；缺少授权、开发身份、模板不匹配均保留不可投递记录，不偷偷改投站内。

当前真实账号已配置 13 个微信平台模板，覆盖全部 30 项业务提醒。映射保存在 Git 忽略的 `backend/.env.notification-mappings.json`，后端已重启，提醒接口确认 30 项全部可用；部署时需同步该文件及 `WECHAT_NOTIFICATION_MAPPINGS` 配置。平台模板复用关系和实际字段见[验收记录](docs/acceptance-status.md)。复用同一平台模板的业务提醒分别保存渠道偏好，但共享该平台模板的一次性订阅机会。

T01“新任务待接受”已通过真实订阅授权、接口直发、手机接收及默认欢迎页回跳。2026-10-22 线上通知跳转环境已切换为体验版 `trial`，使用当前接入生产 HTTPS API 的体验版；已发出的旧消息保留原跳转环境。其余逐模板实发、应用内授权同步、业务自动投递及体验版详情回跳仍待真机验证。

真实账号接入时，参考 `backend/notification-mappings.example.json`，为已审批的模板填写实际字段映射，以 `WECHAT_NOTIFICATION_MAPPINGS` 指向该 JSON。例子的 `thing1 / number2 / time3` 不是你账号的既定字段，必须按平台模板逐项替换。字段值支持 `actor / name / title / amount / occurredAt`；`amount` 对结算、罚分和赠送取对应接收人的实际结果。发送环境由 `WECHAT_MINIPROGRAM_STATE=developer|trial|formal` 指定，默认体验版。映射为空不影响站内业务。

保存接收偏好、用户点击请求单模板微信授权、同步本次授权结果是独立步骤；每条接受报告最多预留一次订阅机会，客户端报告不代表永久授权。网络中断后先核查原操作，再用同一报告标识同步，不重复增加机会。真实微信登录已在开发者工具通过；T01 已独立验证真实授权、直发及手机接收，全部账号模板字段已逐项核对，其他模板实发与完整业务联动仍需核验。

事件消费每 3 秒、微信投递每 5 秒独立扫描，网络调用不持有业务事务锁。微信接口明确失败最多尝试 5 次，结果未知单独保留并停止自动重试。旧版事件没有有效偏好快照，迁移时标记跳过，保留业务历史，不补造历史通知。故障核查与受控重放见 API 文档的维护说明。

## 代码入口

- `backend/internal/app`：接口、用例编排、事务、幂等与门禁。
- `backend/internal/identity`、`rules`、`points`、`checkin`、`catalog`、`orders`、`tasks`、`notifications`：已实现的业务模块。
- `backend/internal/media`：受控封面存储；`scheduler`：执行启动时注入的后台扫描；`eventbus`：业务事务内冻结事件和通知上下文，提交后独立消费并保存收据；`wechat`：服务凭据缓存和订阅发送适配。
- `backend/migrations`：按版本执行的 MySQL 迁移。MySQL DDL 隐式提交，迁移中断后需核对已执行语句再继续，不应直接重跑整份失败迁移。
- `frontend/src/app`：启动门禁、导航与操作恢复界面。
- `frontend/src/features`：业务 API；`core`：请求、查询缓存与操作恢复；`platform`：Taro 能力；`ui`：展示组件。
- `frontend/src/assets`：按当前用途缩小后的图片；原始素材仍在 `assets/ui/v1`，不复制整套源图到包内。

接口和后续里程碑见 [API 约定](docs/api.md) 与 [实施记录](docs/implementation.md)。

## 后端发布

测试期间可通过[服务器重置脚本](deploy/reset-test-data.sh)清空业务数据、会话及图片，默认仅预览，执行前自动备份；命令及范围见[测试数据重置说明](docs/deployment.md#测试数据重置)。

GitHub Actions、Docker Compose、现有 Nginx 路径转发和首次安装步骤见[部署说明](docs/deployment.md)。发布采用与 knowledge 项目一致的版本标签触发方式，服务器运行独立 MySQL/Redis，API 目标地址为 `https://www.flobby.top/couple-mini/api/v1`。服务器首次安装和专用部署密钥授权已完成，`v0.1.1` 已通过完整 Actions 发布。公网 `https://www.flobby.top/couple-mini/health/ready` 返回 ready。之后推送新的版本标签发布；小程序开发版 `0.1.3` 已使用上述 HTTPS API 地址重新构建并上传，微信后台合法域名由用户手动配置。
