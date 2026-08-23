# LoveSuki

LoveSuki 是一个支持目录、Markdown 文章持久化保存和逐字阅读的个人网页应用。

## 已实现功能

- 创建、重命名和删除目录
- 在任意目录下创建、编辑、移动和删除文章
- `/` 为只读显示页面，仅提供文章选择和逐字播放
- 显示页面内置精灵图桌宠，支持 11 组共 73 帧动作、随机表演、点击轮换互动、左右跑动、拖动、隐藏和位置记忆
- `/admin` 为管理页面，集中提供全部目录与文章编辑功能
- Markdown 标题、加粗、斜体、列表、引用、链接、图片、代码块和表格渲染
- Markdown 格式会在逐字出现过程中保持，不会显示原始标记符号
- 保存状态提示、未保存离开提醒及 `Ctrl + S` 快捷保存
- 10–500 毫秒/字实时调速，支持暂停、继续、重新播放和全屏专注模式
- 中文、Emoji 和组合字符按完整字素显示
- 文章按需读取，超长文章不会在目录加载时进入浏览器内存
- PC 优先的三栏布局，并适配窄屏设备

## 数据存储方案

本版本没有引入数据库，而是采用“轻量索引 + 独立 Markdown 文件”：

```text
data/
├── catalog.json           # 目录与文章标题、归属关系、时间等元数据
└── articles/
    ├── <article-id>.md    # 每篇文章一个原始 Markdown 文件
    └── ...
```

这样比把全部正文写进一个巨大 JSON 文件更适合个人服务器：只打开一篇文章时只读取一个文件，500 万字不会拖慢整个目录；Markdown 文件也能直接备份和恢复。保存采用同目录临时文件写入后原子替换，减少写入中断造成损坏的风险。

当前单篇文章上限为 1000 万个 JavaScript 字符，Nginx 请求体上限为 64 MB。页面字数和进度使用常量时间的字符串长度计算，逐字引擎不会预先拆出数百万个字符元素。

## 项目结构

```text
LoveSuki/
├── backend/
│   ├── api/router.js
│   ├── services/
│   │   ├── library-store.js
│   │   └── markdown-renderer.js
│   ├── utils/http.js
│   ├── server.js
│   └── static-handler.js
├── data/                   # 运行数据，不提交到 Git
├── public/
│   ├── index.html             # 只读显示页面
│   ├── admin.html             # 文章管理页面
│   ├── styles/main.css
│   └── scripts/
│       ├── admin.js
│       ├── viewer.js
│       └── modules/
├── deploy/
│   ├── LoveSuki.nginx
│   └── LoveSuki.service
├── tests/
├── package.json
└── package-lock.json
```

## 本地运行

要求 Node.js 18 或更高版本。

```bash
npm ci
npm test
npm start
```

默认只监听 `127.0.0.1:3023`，本机打开 `http://127.0.0.1:3023`。

## Ubuntu 服务器部署

项目目录为 `/opt/LoveSuki`，Node.js 仅监听内部端口 `3023`，Nginx 对外监听 `16023`，服务由 root 用户和 systemd 管理。

### 1. 拉取项目并安装依赖

```bash
mkdir -p /opt/LoveSuki
git clone https://github.com/LIKE9426334946/LoveSuki.git /opt/LoveSuki
cd /opt/LoveSuki
npm ci --omit=dev
npm test
```

### 2. 安装 systemd 服务

```bash
cp /opt/LoveSuki/deploy/LoveSuki.service /etc/systemd/system/LoveSuki.service
systemctl daemon-reload
systemctl enable LoveSuki
systemctl start LoveSuki
systemctl status LoveSuki
```

### 3. 安装并启用 Nginx 配置

```bash
cp /opt/LoveSuki/deploy/LoveSuki.nginx /etc/nginx/sites-available/LoveSuki
ln -s /etc/nginx/sites-available/LoveSuki /etc/nginx/sites-enabled/LoveSuki
nginx -t
systemctl reload nginx
```

如果软链接已经存在，无需重复创建。

### 4. 验证

```bash
curl http://127.0.0.1:3023/api/health
curl http://127.0.0.1:16023/api/health
```

浏览器访问：

```text
http://服务器公网IP:16023
```

## 后续更新

```bash
cd /opt/LoveSuki
git pull origin main
npm ci --omit=dev
npm test
systemctl restart LoveSuki
systemctl status LoveSuki
```

更新代码不会覆盖 `data` 目录。建议定期备份：

```bash
cp -a /opt/LoveSuki/data /opt/LoveSuki-data-backup
```
