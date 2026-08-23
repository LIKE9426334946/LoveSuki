# LoveSuki

LoveSuki 是一个简洁、沉浸的文字逐字显示网页应用。基础版本支持输入任意文字、逐字播放、实时调速、暂停/继续、重新播放和全屏专注显示。

## 功能

- Unicode 字素级逐字显示，中文、Emoji 和组合字符都能正确处理
- 播放过程中实时调整速度（10–500 毫秒/字）
- 暂停、继续、重新开始、清空和全屏专注模式
- 播放进度、字数统计与键盘 Space 快捷控制
- 惰性文字游标与单文本节点追加，避免为超长文字创建海量 DOM 元素
- PC 优先设计，同时具备响应式布局
- 无第三方运行依赖，适合长期部署

## 项目结构

```text
LoveSuki/
├── backend/
│   ├── server.js              # Node.js 服务入口
│   └── static-handler.js      # 静态资源与安全响应头
├── public/
│   ├── index.html
│   ├── styles/main.css
│   └── scripts/
│       ├── app.js             # 页面协调层
│       └── modules/
│           ├── fullscreen.js  # 全屏控制
│           ├── text-cursor.js # Unicode 惰性文字游标
│           └── typewriter.js  # 逐字播放引擎
├── deploy/
│   ├── LoveSuki.nginx
│   └── LoveSuki.service
├── tests/
└── package.json
```

## 本地运行

要求 Node.js 18 或更高版本。

```bash
npm test
npm start
```

默认只监听 `127.0.0.1:3023`，打开 `http://127.0.0.1:3023` 即可访问。

## 500 万字与数据库决定

基础版本不保存文字，因此暂时不使用数据库。播放引擎不会预先扫描全文、不会把文本拆成字符数组，也不会为每个字创建一个 HTML 元素；它会惰性读取并向同一个文本节点分批追加，能显著控制启动时间和内存占用。为了避免每次输入都遍历超长全文，页面上的字数和播放进度使用字符串长度快速计算；这对中文准确，少量复合 Emoji 可能按多个编码单元计数，但逐字显示仍会把完整 Emoji 作为一个整体。

当后续加入“历史记录、跨设备保存、AI 生成内容”时，计划使用服务器本机 SQLite：长文本正文单独存储，历史列表只读取摘要和元数据，正文按需加载。500 万汉字的 UTF-8 数据通常为十几 MB，SQLite 足够可靠，也比反复读写一个超大 JSON 文件更安全。若未来需要直接导入超大文件，可再增加流式上传和分段读取，不需要重写当前播放界面。

## Ubuntu 服务器部署

以下步骤符合项目约定：项目位于 `/opt/LoveSuki`，Node.js 仅监听内部端口 `3023`，Nginx 对外监听 `16023`，服务使用 root 运行并由 systemd 管理。

### 1. 创建并拉取项目

```bash
mkdir -p /opt/LoveSuki
git clone https://github.com/LIKE9426334946/LoveSuki.git /opt/LoveSuki
cd /opt/LoveSuki
npm test
```

项目没有第三方生产依赖，因此不需要执行 `npm install`。

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

### 5. 后续更新

```bash
cd /opt/LoveSuki
git pull origin main
npm test
systemctl restart LoveSuki
systemctl status LoveSuki
```

## 后续扩展位置

- AI 生成文字：新增 `backend/routes/ai.js` 与前端 AI 面板
- 动画效果：扩展 `Typewriter` 渲染策略，不影响控制层
- 历史记录和数据保存：新增 SQLite repository/service 层
- 字体、颜色、背景、音效和主题：新增独立设置模块并保存在浏览器本地
- 超大文件：新增流式上传 API 与分段读取适配器
