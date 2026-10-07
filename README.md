# 杭州主城区游玩锻炼一日路线规划器

> 仓库地址：<https://github.com/yanghq257/hangzhou_day_trip_planner>

一个**完全不依赖大模型（LLM）**的杭州一日游路线规划 Web 工具。项目只使用**高德 Web 服务 API** 与**内置的杭州主城区景点库**，通过纯规则引擎生成「游玩 + 锻炼」的一日路线，适合直接上传个人 GitHub 使用与二次开发。

## 功能特性

- 移动端优先的 Web 表单，支持手机浏览器访问
- 地址地理编码：调用高德地理编码 API，校验出发/返回地址属于杭州主城区
- 景点筛选：按「是否爬山」过滤景点；必去景点强制保留；剩余景点用最近邻贪心算法补齐
- 交通硬规则：
  - 湖中孤岛（湖心亭、三潭印月、阮公墩）只允许游船进出，禁止步行/打车/自驾
  - 任意两点之间步行预估超过 40 分钟，自动改用打车
- 时间轴构建：调用高德路径规划 API 获取各段交通耗时，并叠加缓冲系数
- 高德静态地图：生成带点位标记与轨迹的静态地图图片
- 风险校验：总时长超限、路上耗时占比过高、孤岛交通非法、超长步行等警告
- 全程异常兜底：高德接口报错、地理编码失败、景点数量不足均以友好文字提示，不崩溃

## 项目结构

```
hangzhou_day_trip_planner/
├─ main.py           # FastAPI 后端入口，路由、session 处理
├─ utils.py          # 高德 API 封装、景点库、距离计算、地图生成、规划算法
├─ templates/
│  ├─ index.html     # 首页输入表单
│  └─ result.html    # 结果页
├─ static/
│  └─ style.css      # 移动端优先样式
├─ .gitignore
├─ requirements.txt
└─ README.md
```

## 环境要求

- Python 3.9 及以上（推荐 3.10 / 3.11）
- 可访问高德开放平台接口的网络环境

## 安装步骤

```bash
# 1. 进入项目目录
cd hangzhou_day_trip_planner

# 2. 创建并激活虚拟环境（可选，推荐）
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

# 3. 安装依赖
pip install -r requirements.txt
```

## 运行启动

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

启动后浏览器访问：<http://127.0.0.1:8000>

## 使用说明

1. 前往[高德开放平台](https://lbs.amap.com/)注册账号，创建应用并申请 **Web 服务** 类型的 API Key（Key）。
2. 打开首页，在「高德 API Key」输入框填入你的 Key，点击「生成路线」即可。
3. 也可以不填 Key，改用系统环境变量方式提供：

   ```bash
   # Windows PowerShell
   $env:AMAP_KEY="你的高德Key"
   # macOS / Linux
   export AMAP_KEY="你的高德Key"
   ```

   > 优先级：网页输入的 Key > 环境变量 `AMAP_KEY`。网页输入会覆盖环境变量，并保存在当前 session 会话中。

4. 填写出发地址、返回地址、是否爬山、必去景点、游玩景点数量（2-6），生成路线。

## 测试用例

1. 出发：`杭州市西湖区中杭府`，返回：`新城国际花园彩园`；爬山 = 是；必去景点：`龙井村`；景点数量 = 3 → 输出合理登山一日路线。
2. 选中 `湖心亭` → 自动强制游船交通，不会生成步行/打车进出岛屿。
3. 跨点步行预估 > 40 分钟 → 不会选用步行。
4. 必去景点为空 → 就近自动挑选景点。

## 重要提示

- **本项目不提供高德密钥**，请使用者自行前往高德开放平台申请。
- 高德 API Key 只来自网页 session 或系统环境变量 `AMAP_KEY`，代码中**不硬编码任何 Key**。
- 高德 Web 服务 API 有每日免费调用配额，请合理使用。
- 本项目为演示/学习用途，路线结果仅供参考，实际出行请以现场交通与景区开放情况为准。

## 外网临时访问（可选）

可使用 [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) 将本地服务临时暴露到公网：

```bash
# 先启动本地服务
uvicorn main:app --host 127.0.0.1 --port 8000

# 另开终端，用 cloudflared 建立临时隧道
cloudflared tunnel --url http://127.0.0.1:8000
```

终端会输出一个 `https://xxx.trycloudflare.com` 的临时公网地址，用手机浏览器即可访问。

## 云端部署（Render）

本仓库已包含 `Procfile` 与 `runtime.txt`，可直接部署到 [Render](https://render.com)。

1. 登录 Render，点击 **New → Web Service**。
2. 选择「Build and deploy from a Git repository」，连接本 GitHub 仓库。
3. Render 会自动读取 `runtime.txt`（Python 3.11.9）与 `Procfile`。
   - 若未识别到 Procfile，手动填写：Build Command = `pip install -r requirements.txt`，Start Command = `uvicorn main:app --host 0.0.0.0 --port $PORT`。
4. 在 **Environment Variables** 中按需添加：
   - `SESSION_SECRET`：任意随机字符串（会话签名用，生产环境建议设置）。
   - `AMAP_KEY`：可选；不设置则用户在网页端自行填写高德 Key。
5. 点击 **Create Web Service** 等待构建完成，即可获得 `https://xxx.onrender.com` 公网地址。

> 注意：Render 免费实例闲置一段时间会休眠，首次访问唤醒较慢属正常现象。

## 安卓 WebView 壳

`android_app/` 目录是一个最小化安卓 WebView 工程，仅申请 `INTERNET` 权限，全屏加载网页，不改动任何 Web 业务代码。

1. 用 Android Studio 打开 `android_app/`（或直接执行 Gradle 构建）。
2. 将 `android_app/app/src/main/res/values/strings.xml` 中的 `app_url` 占位符替换为你的 Render 公网域名。
3. 构建 release APK：
   ```bash
   # Windows
   android_app\build_release.bat
   # macOS / Linux
   bash android_app/build_release.sh
   ```
   产物位于 `android_app/app/build/outputs/apk/release/app-release.apk`。
4. 将 APK 安装到安卓手机即可使用（WebView 已开启 JavaScript 与 DOM Storage，兼容前端三级下拉与 sessionStorage 存 Key）。

## 发布 APK 到 GitHub Release

打包完成后，可用脚本一键上传到 GitHub Release 生成下载链接（脚本不硬编码任何 Token）：

```bash
# 设置个人访问令牌（GitHub -> Settings -> Developer settings -> Personal access tokens）
export GITHUB_TOKEN="你的Token"   # Windows PowerShell: $env:GITHUB_TOKEN="你的Token"

python upload_release.py android_app/app/build/outputs/apk/release/app-release.apk
```

## 许可证

本项目采用 [MIT License](LICENSE) 开源。

## 免责声明

本项目不调用任何大语言模型（LLM / OpenAI / LangGraph），全部规划逻辑为纯规则引擎；路线结果仅供参考，实际出行请以现场交通与景区开放情况为准。使用高德开放平台 API 请遵守其服务条款与调用配额。本项目不提供、也不收集任何高德 API Key。
