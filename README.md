# 看房对比 · 私人选房小站

女朋友整理的武汉选房对比表（15 个小区），做成手机友好的网站：一个**对比展示页**，一个**看房视频上传页**。

## 功能

- **数据结构**：小区 → 房子（一套房 = 名称/大小/价格/备注）→ 看房视频，三级。一个小区可以看过好几套房，视频各自挂在房子下
- **展示页 `/`**：Excel 式全字段表格——地区/小区/物业/物业费/优缺点/地铁/幼儿园/小学/初中/人车分流/备注 11 列全展示，表头和地区列双向固定（横竖滚动都像 Excel）；筛选（地区 / 🚇地铁800m内 / 🚗人车分流 / 🏫初中固定对口）；关键字搜索；行内「编辑」改任意字段、「删除」删整行
- **小区详情**：点表格里的小区名弹出详情层——小区全信息 + 该小区看过的每套房（大小/价格/备注 + 各自视频），在这里添加房子、按房传视频、删除
- **上传页 `/upload`**：选小区 → 选哪套房（没有就现场添加，填大小/价格/备注）→ 传视频（带进度条），可写一句提醒
- 数据存 SQLite（`houses.db`，首次启动自动从 `static/seed.json` 导入），视频存 `static/uploads/`

## 运行

```bash
pip install -r requirements.txt
python app.py          # 服务跑在 5000 端口
```

- 本机：浏览器打开 <http://127.0.0.1:5000>
- 手机（连同一 WiFi）：打开 `http://<电脑IP>:5000`（IP 用 `ipconfig` 查"IPv4 地址"）

> iPhone 拍的视频是 `.mov`，已支持直接传。单文件最大 1GB。

## 部署到云服务器（随时随地看）

1. 服务器装 Python 3.10+，把整个 `house-compare/` 目录传上去
2. `pip install -r requirements.txt && python app.py`
3. 用 nginx 反代 5000 端口（或在 `app.py` 末尾把 `app.run(...)` 换成 waitress）：

```nginx
server {
    listen 80;
    server_name your.domain.com;
    client_max_body_size 1024m;          # 视频上传别被 nginx 拦
    location / { proxy_pass http://127.0.0.1:5000; }
}
```

## 访问口令（可选，建议公网部署时开）

```bash
# Windows (PowerShell)
$env:SITE_PASSWORD="你家口令"; python app.py
# Linux
SITE_PASSWORD=你家口令 python app.py
```

设置后首次打开页面会要求输入口令，存在浏览器里，之后不用再输。

## 目录结构

```
house-compare/
├── app.py              # Flask 后端（房源增删改查 + 视频上传/播放/删除）
├── requirements.txt
├── static/
│   ├── seed.json       # Excel 整理出的 15 个小区初始数据
│   ├── style.css / common.js / table.js / upload.js
│   └── uploads/        # 看房视频
└── templates/
    ├── index.html      # 对比表格展示页
    └── upload.html     # 视频上传页
```
