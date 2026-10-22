# 后端部署

目标为 `https://www.flobby.top/couple-mini/api/v1`。复用已有 Nginx 和 HTTPS，代理至 `127.0.0.1:18081`。MySQL、Redis 不发布宿主机端口，三个持久卷独立于服务器已有项目。

2026-10-22，`v0.1.0` 已通过 [GitHub Actions 首次发布](https://github.com/Flobby949/couple-mini/actions/runs/39709129312)。API、MySQL、Redis 三个容器均健康，公网 readiness/liveness 返回 200，未登录读取返回 401，开发身份登录返回 403。目标服务器初始空载实测 API/MySQL/Redis 约 15/162/8 MiB；生产数据恢复演练和异地备份仍待完成。

## 发布流程

参考 [knowledge 的 Actions](https://github.com/Flobby949/knowledge/blob/main/.github/workflows/deploy.yml)，推送新的 `vMAJOR.MINOR.PATCH` 标签发布；标签须指向 `main` 上的提交。

1. GitHub Actions 启动临时 MySQL/Redis，执行非缓存 Go race 集成测试和 vet。
2. 构建 `linux/amd64` 镜像到私有 GHCR 包，以版本和提交 SHA 标记。
3. 通过专用 SSH 密钥调用服务器固定部署脚本，实际部署使用不可变镜像 digest。
4. 首次部署初始化独立数据库；后续部署先停止 API，同时暂停业务与微信投递，保存数据库和图片备份，再启动新 API、执行迁移并检查健康状态。

启动或重建不删除持久卷。不要执行生产 `docker compose down -v`。启动迁移包含 MySQL DDL，失败后须检查已执行语句；脚本不会自动回滚数据库或盲目重试迁移。

## 服务器首次准备

服务器现状：CentOS 7、x86_64、Docker 26.1.4、Compose 2.21.0，内存约 1.7 GiB；2026-10-22 检查时可用约 670 MiB，无 swap，已有其他业务和 MySQL 容器。Compose 为新 MySQL、Redis、API 分别设置 384/64/256 MiB 上限，首次启动后仍需检查真实内存、OOM 和健康情况。

在本地准备不进入 Git 的一次性目录，包含以下文件，然后通过当前已认证的管理连接上传：

- `compose.yaml`、`deploy.sh`、`bootstrap.sh`、`nginx-location.conf`，取自 `deploy/`。
- `.env`，按 `deploy/.env.example` 填写；三个独立随机十六进制密码，微信凭据仅放在此文件。
- `notification-mappings.json`，取自已验真的本地 `backend/.env.notification-mappings.json`，包含 30 项业务提醒。
- `deploy-key.pub`，本项目专用 SSH 公钥。私钥保留给本仓库 Actions，不上传到服务器。

确认文件后在该目录执行 `bash bootstrap.sh`。脚本创建 `/opt/couple-mini`，增加 Nginx 路径、验证并 reload Nginx，为专用公钥设置 forced command。该密钥只能调用本项目部署脚本，不允许交互 shell、PTY 或端口转发。现有 SSH 登录方式保持可用。

本机 Nginx 由已有进程运行，使用 `nginx -s reload`。部署入口和 Compose 文件由管理员首次安装并持有；后续修改这些文件时需通过管理连接更新服务器副本，Actions 的受限密钥仅更新本项目镜像版本。

GitHub 私有仓库 `Flobby949/couple-mini` 的 Actions Secrets：

| Secret | 内容 |
| --- | --- |
| `DEPLOY_HOST` | 目标服务器 IP |
| `DEPLOY_SSH_KEY` | 本项目专用 Ed25519 私钥 |
| `DEPLOY_KNOWN_HOSTS` | 从当前已认证连接核对指纹后的服务器 Ed25519 known_hosts 行 |

GHCR 使用作业自身的 `GITHUB_TOKEN`，不需要另建长期 registry token。服务器使用临时 Docker 登录目录，部署退出后删除该目录，不覆盖其他项目的 Docker 凭据。应用配置与私钥不得提交到仓库或构建上下文。

## 发布与验证

```sh
git push origin HEAD:main
git tag v0.1.0
git push origin v0.1.0
```

在 Actions 中确认测试、镜像构建、部署全部成功，再检查：

```sh
curl --fail https://www.flobby.top/couple-mini/health/ready
```

生产 API 地址设置为 `TARO_APP_API_BASE=https://www.flobby.top/couple-mini/api/v1` 后重新构建并上传小程序。微信后台的 request/uploadFile/downloadFile 合法域名都需包含 `https://www.flobby.top`。后端始终关闭开发登录；当前仍为开发版联调，`WECHAT_MINIPROGRAM_STATE=developer`，设置体验版或正式版时同步调整。

## 运维与恢复边界

服务器管理终端中，先加载上次通过健康检查的镜像引用：

```sh
cd /opt/couple-mini
export BACKEND_IMAGE="$(cat .current-image)"
docker compose --env-file .env -f compose.yaml ps
docker compose --env-file .env -f compose.yaml logs --tail=100 api
```

后续发布的备份保存在 `backups/<UTC时间>/`，含 `database.sql`、`media.tar.gz` 和当时的镜像引用。数据库与图片必须成套保留；只在服务器保存备份不足以应对磁盘丢失，还需复制到独立位置并设置保留策略。

恢复时先停止 API，确认迁移版本和图片引用，并核对备份后实际发出的微信消息，保留这些投递的已成功/未知状态，避免恢复旧数据库后重复通知。先在独立临时数据库、图片卷演练恢复，验证余额、流水、图片和版本，再安排生产恢复。Redis 中的登录会话未纳入 SQL/图片备份，必要时重新登录。

部署失败时 `.current-image` 保留上个健康版本。检查迁移是否完成并确认版本兼容后再选择旧镜像启动；不要用容器镜像回退替代数据库恢复。
