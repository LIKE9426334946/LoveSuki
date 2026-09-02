# LoveSuki

LoveSuki 是一个支持目录、Markdown 文章持久化保存和逐字阅读的个人网页应用。

## 已实现功能

- 创建、重命名和删除目录
- 在任意目录下创建、编辑、移动和删除文章
- 可为每篇文章上传、替换、试听和删除独立音频，显示页面支持播放、暂停与拖动进度
- `/` 为只读显示页面，仅提供文章选择和逐字播放
- 显示页面针对手机竖屏重新设计，使用沉浸式一屏阅读布局与紧凑触控控制栏
- `/admin` 为管理页面，集中提供全部目录与文章编辑功能
- 主显示页和管理页都必须登录，固定单账号登录状态保留 30 天
- 无注册和用户创建入口，支持从两个页面安全退出登录
- Markdown 标题、加粗、斜体、列表、引用、链接、图片、代码块和表格渲染
- Markdown 格式会在逐字出现过程中保持，不会显示原始标记符号
- 保存状态提示、未保存离开提醒及 `Ctrl + S` 快捷保存
- 10–500 毫秒/字实时调速，支持暂停、继续、重新播放和全屏专注模式
- 手机端通过右上角设置面板调节速度，并可一键立即显示当前文章的全部内容
- 手机显示页固定为一屏阅读区，文章目录通过侧滑抽屉打开，不会再上下堆叠挤占正文空间
- 兼容手机动态视口与刘海屏安全区；不支持原生全屏的浏览器会自动使用页面级专注模式
- 中文、Emoji 和组合字符按完整字素显示
- 文章按需读取，超长文章不会在目录加载时进入浏览器内存
- 电脑端保留宽屏布局，显示页、管理页和登录页均适配手机触控操作
- 每天北京时间 07:10 自动读取仓库 `daily-articles/YYYY-MM-DD.md`，并把英文文章导入“默认目录”

## 数据存储方案

本版本没有引入数据库，而是采用“轻量索引 + 独立 Markdown 文件”：

```text
data/
├── catalog.json           # 目录与文章标题、归属关系、时间等元数据
├── .session-secret        # 自动生成的登录会话签名密钥
├── articles/
│   ├── <article-id>.md    # 每篇文章一个原始 Markdown 文件
│   └── ...
└── audio/
    ├── <article-id>-<file-id>.mp3  # 每篇文章的独立音频文件
    └── ...
```

这样比把全部正文写进一个巨大 JSON 文件更适合个人服务器：只打开一篇文章时只读取一个文件，500 万字不会拖慢整个目录；Markdown 文件也能直接备份和恢复。保存采用同目录临时文件写入后原子替换，减少写入中断造成损坏的风险。

当前单篇文章上限为 1000 万个 JavaScript 字符，单个音频上限为 100 MB，Nginx 请求体上限为 128 MB。音频采用流式写入，不会把整个文件一次性载入 Node.js 内存；播放接口支持 HTTP Range，可在手机上拖动播放进度。页面字数和进度使用常量时间的字符串长度计算，逐字引擎不会预先拆出数百万个字符元素。

## 项目结构

```text
LoveSuki/
├── backend/
│   ├── api/router.js
│   ├── auth-handler.js
│   ├── services/
│   │   ├── auth-service.js
│   │   ├── library-store.js
│   │   └── markdown-renderer.js
│   ├── utils/http.js
│   ├── server.js
│   └── static-handler.js
├── data/                   # 运行数据，不提交到 Git
├── daily-articles/         # 自动生成的每日英文文章，使用 YYYY-MM-DD.md 命名
├── public/
│   ├── index.html             # 只读显示页面
│   ├── admin.html             # 文章管理页面
│   ├── login.html             # 固定账号登录页面
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

固定登录用户名为 `noart`，密码采用用户指定的固定值。仓库只保存密码的不可逆哈希，不会把密码明文写入前端、README 或运行日志。

系统没有注册和创建其他账号的接口。登录会话有效期为 30 天，签名密钥保存在运行数据目录，重启服务和更新代码不会导致已登录设备退出。

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

## 每日英文文章同步

每天生成的文章提交到 `main` 分支的 `daily-articles/YYYY-MM-DD.md`。LoveSuki 会在北京时间 07:10 主动检查当天文章，不依赖用户打开网页。若文章尚未生成或 GitHub 请求失败，服务器每 5 分钟重试一次，直到文章成功写入本地“默认目录”；成功后当天不再请求，服务重启后也会根据本地文章记录自动跳过。文章侧栏标题使用日期，Markdown 正文仍保留文章标题、词汇、语法讲解和问题等完整内容。

同步请求会优先使用 IPv4，以避免部分服务器可以通过 `curl` 访问 GitHub、但 Node.js `fetch` 因 IPv6 网络不可用而失败的问题。同步状态可通过 `journalctl -u LoveSuki` 查看。

文章导入后仍是普通的本地文章，可以在管理页中编辑或移动。若 GitHub 中同一天的文件内容后来发生变化，下一次同步会用新版本更新正文。
