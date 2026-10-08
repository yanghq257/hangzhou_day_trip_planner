# 杭州一日路线规划器（纯前端版）

本目录是把原 FastAPI 后端项目完整改造为**纯静态网页版**的结果，无需 Python、无需 uvicorn，可直接双击 HTML 本地运行，也可部署到 GitHub Pages。

核心特点：

- 纯规则引擎，不调用任何大模型
- 高德 JS API（地理编码 / 步行 / 驾车路径）+ 内置景点库
- 所有计算都在浏览器本地完成，结果通过 `sessionStorage` 在两个页面间传递

## 目录结构

```
frontend/
├── index.html            # 规划输入页
├── result.html           # 路线结果页
├── js/
│   ├── trip-engine.js    # 规则引擎（由 utils.py 翻译而来）
│   └── main.js           # 输入页交互逻辑
└── static/
    └── style.css         # 全局样式（与后端 static/ 相同）
```

## 本地打开方法

1. 用浏览器直接双击打开 `index.html`（推荐 Chrome / Edge）。
2. 在高德开放平台申请两个 Key：
   - **Web 服务 API Key**：用于生成静态地图（选填）。
   - **Web 端（JS API）Key**：用于地理编码、步行/驾车路径计算与动态地图（必填）。
3. 填写 Key、选择或输入出发/返回地址，点击「生成路线」。
4. 结果页展示摘要、风险提示、景点安排、完整时间轴与地图。

> 说明：本版本通过高德 JS SDK 计算路径，因此不需要像后端那样直接调用 Web 服务 REST 接口，也能避免浏览器跨域问题。

## GitHub Pages 部署步骤

1. 在 GitHub 新建仓库（如 `hangzhou_day_trip_planner`）。
2. 将本 `frontend/` 目录内的全部内容推送到仓库根目录，或推送到一个子目录后在 Pages 设置中选择该目录。
3. 打开仓库 `Settings → Pages`：
   - Source 选择 `Deploy from a branch`
   - Branch 选择 `main`，目录选择 `/ (root)` 或对应子目录
4. 保存后等待部署完成，访问 `https://<用户名>.github.io/<仓库名>/`。

## 注意事项

- **API Key 由用户自行填写**，程序不会内置任何 Key。
- **Key 保存在浏览器 `localStorage` 中**（勾选「保存到本机」时），仅存于用户本机，**不会上传到任何服务器**。
- 若使用公共电脑，请勿勾选「保存到本机」，使用后点击「清除」。
- 高德 JS API 加载需要联网；Web 服务 Key 仅用于静态地图，可留空。
