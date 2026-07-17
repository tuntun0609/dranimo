# Dranimo

Dranimo 是一个本地优先的手绘动画工具。你可以直接在浏览器中绘制笔画、调整动画节奏、预览绘制过程，并导出图片或视频。

## 功能

- 支持鼠标、触控板和触摸绘制
- 自定义画笔颜色、粗细、透明度和笔触参数
- 整笔擦除、撤销、重做和清空画布
- 提供 1:1、16:9、9:16 三种画布比例
- 按真实速度、固定速度或指定总时长播放动画
- 在浏览器本地管理多个画布并自动保存
- 导出 PNG、SVG、WebM、MP4 和透明 MOV
- 支持透明背景、自适应裁切、留白、倍率和帧率设置

## 本地运行

仓库使用 Bun 管理依赖：

```bash
bun install
bun dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可使用。

项目数据保存在当前浏览器的本地存储中，不会自动上传到服务器。清理浏览器站点数据会同时删除本地画布。

### 透明 MOV 导出

透明 MOV 使用 ProRes 4444 编码，需要系统安装 `ffmpeg`。也可以通过 `FFMPEG_PATH` 指定可执行文件路径：

```bash
FFMPEG_PATH=/path/to/ffmpeg bun dev
```

PNG、SVG、WebM 和 MP4 导出不需要安装 `ffmpeg`，但视频编码能力仍取决于当前浏览器。

## 常用命令

```bash
bun dev          # 启动开发服务器
bun run build    # 构建生产版本
bun run start    # 启动生产服务器
bun run lint     # 运行 Biome 检查
bun run format   # 格式化代码
bun test         # 运行单元测试
```

## 技术栈

- Next.js 16、React 19、TypeScript
- Tailwind CSS 4、shadcn/ui
- perfect-freehand
- MediaBunny
- Sharp、FFmpeg（透明 MOV 导出）
