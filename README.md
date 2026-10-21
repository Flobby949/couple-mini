# 情侣小店

永久无真实金钱的两人小店。产品规则见 [PRD](docs/PRD.md)，前端分层与实施顺序见 [前端架构](docs/frontend-architecture.md)。

当前实现为第一轮开发：Taro 四 Tab 工程，以及登录 → 一次性邀请绑定 → 双方确认共同规则 → 签到首页 → 积分池明细的真实后端闭环。任务、商品、购物车、订单、赠送与消息尚未开放，页面会明确说明。没有预置商品或个人初始积分。

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
# 或 pnpm build:weapp
```

在微信开发者工具导入 `frontend/`，小程序根目录为 `dist/weapp/`。`project.config.json` 当前使用游客 AppID；真实联调时填写自己的 AppID，在后端配置 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`，客户端与服务端 AppID 必须一致。

真机使用微信可访问的 HTTPS API 域名，并配置小程序合法请求域名；在前端 `.env` 设置 `TARO_APP_API_BASE`。服务器关闭开发登录再部署。服务端用微信 code 换取 OpenID，Redis 保存七天有效的自有会话，平台 session_key 不返回客户端。微信账号、体验成员、域名及真机尚未在本环境验证；H5 预览不能替代这些检查。

## 验证

```sh
make check
make integration
```

`make check` 运行 Go 单测与 vet、前端类型检查与单测，以及小程序/H5 生产构建。`make integration` 读取 `backend/.env`，要求 MySQL 账号有临时建库和删库权限；每次创建随机 `couple_test_*` 数据库，测试结束只删除该库。Redis 只清理测试创建的会话键，不使用 FLUSHDB，不修改开发库数据。

集成覆盖：并发绑定、原子初始化、门禁与对象权限、上限 0、负数与越界、同键并发重放/参数冲突、每日签到唯一、北京时间跨日、累计里程碑、规则修改不重置已得、操作关闭与迟到请求竞争、Outbox 写失败整体回滚、积分池与流水核对。

## 代码入口

- `backend/internal/app`：接口、用例编排、事务、幂等与门禁。
- `backend/internal/identity`、`rules`、`points`、`checkin`、`catalog`：已用到的业务模块；`catalog` 当前只负责绑定时建立空店。
- `backend/internal/eventbus`：业务事务内保存不可变事件；本轮尚无通知消费者和后台投递。
- `backend/migrations`：按版本执行的 MySQL 迁移。MySQL DDL 隐式提交，迁移中断后需核对已执行语句再继续，不应直接重跑整份失败迁移。
- `frontend/src/app`：启动门禁、导航与操作恢复界面。
- `frontend/src/features`：业务 API；`core`：请求、查询缓存与操作恢复；`platform`：Taro 能力；`ui`：展示组件。
- `frontend/src/assets`：按当前用途缩小后的图片；原始素材仍在 `assets/ui/v1`，不复制整套源图到包内。

接口和后续里程碑见 [API 约定](docs/api.md) 与 [实施记录](docs/implementation.md)。
