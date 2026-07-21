import {
  ArrowRight,
  Check,
  Download,
  FolderClock,
  Gauge,
  Layers3,
  LockKeyhole,
  Pencil,
  Play,
  Sparkles,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { GitHubIcon } from '@/components/GitHubIcon'
import { HeroDemo } from '@/components/home/HeroDemo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { EXPORT_FORMATS } from '@/lib/formats'

export const metadata: Metadata = {
  title: {
    absolute: 'Dranimo - 手绘动画工具',
  },
  description:
    '在浏览器里手绘、调节动画节奏，并导出 PNG、SVG、WebM、MP4 或透明 MOV。',
}

const WORKFLOW = [
  {
    number: '01',
    title: '画下每一笔',
    description: '鼠标、触控板或触摸屏都能直接绘制，笔触自然保留速度与压力感。',
    icon: Pencil,
    accent: 'coral',
  },
  {
    number: '02',
    title: '调好动画节奏',
    description: '按真实速度、固定速度或总时长回放，让线条在恰当的时间出现。',
    icon: Play,
    accent: 'blue',
  },
  {
    number: '03',
    title: '导出即用文件',
    description: '同一份画布可以输出静态图、网页视频、通用视频或透明素材。',
    icon: Download,
    accent: 'yellow',
  },
] as const

const CAPABILITIES = [
  {
    title: '有手感的画笔',
    description: '颜色、粗细、透明度、平滑和压力模拟都能细调。',
    icon: Pencil,
  },
  {
    title: '常用画布比例',
    description: '1:1、16:9、9:16 覆盖头像、视频与竖屏内容。',
    icon: Layers3,
  },
  {
    title: '可控的回放速度',
    description: '按真实轨迹、固定像素速度或指定总时长播放。',
    icon: Gauge,
  },
  {
    title: '本地项目库',
    description: '多画布自动保存在当前浏览器，不需要先创建账号。',
    icon: FolderClock,
  },
] as const

const FORMAT_LOOP = [
  ...EXPORT_FORMATS.map(({ format, long }) => ({
    id: `${format}-first`,
    format,
    label: long,
  })),
  ...EXPORT_FORMATS.map(({ format, long }) => ({
    id: `${format}-second`,
    format,
    label: long,
  })),
]

function Brand() {
  return (
    <Link
      href="/"
      aria-label="Dranimo 首页"
      className="inline-flex items-center gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <span className="grid size-8 -rotate-6 place-items-center rounded-md bg-studio-yellow text-foreground">
        <Sparkles size={17} />
      </span>
      <span className="text-lg font-bold">dranimo</span>
    </Link>
  )
}

export default function HomePage() {
  return (
    <main className="home-page min-h-screen overflow-clip bg-background">
      <header className="sticky top-0 z-30 flex h-16 items-center border-b border-border bg-[color-mix(in_oklab,var(--background)_92%,transparent)] backdrop-blur-lg">
        <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between px-5 md:px-8">
          <Brand />
          <nav
            aria-label="首页导航"
            className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a className="home-nav-link" href="#features">
              功能
            </a>
            <a className="home-nav-link" href="#workflow">
              流程
            </a>
            <a className="home-nav-link" href="#formats">
              导出
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button
              nativeButton={false}
              render={
                <Link
                  href="https://github.com/tuntun0609/dranimo"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="在 GitHub 查看 Dranimo"
                  title="GitHub"
                />
              }
              size="icon-sm"
              variant="outline">
              <GitHubIcon data-icon="inline-start" />
            </Button>
            <Button
              nativeButton={false}
              render={<Link href="/editor" />}
              size="sm">
              打开编辑器
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </header>

      <section
        aria-labelledby="home-title"
        className="home-hero border-b border-border">
        <div className="mx-auto grid w-full max-w-[1240px] items-center gap-10 px-5 py-14 md:px-8 md:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          <div className="max-w-[620px]">
            <Badge variant="outline">
              <Sparkles data-icon="inline-start" />
              本地优先的手绘动画工具
            </Badge>
            <h1
              id="home-title"
              className="mt-5 text-6xl leading-none font-black tracking-normal md:text-7xl">
              Dranimo
            </h1>
            <p className="mt-3 text-2xl leading-tight font-semibold md:text-3xl">
              把每一笔，变成会播放的动画
            </p>
            <p className="mt-4 max-w-[520px] text-sm leading-6 text-muted-foreground md:text-base">
              在浏览器里完成绘制、节奏调整与导出。无需上传素材，也不用先学复杂的时间轴。
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                nativeButton={false}
                render={<Link href="/editor" />}
                size="lg">
                <Pencil data-icon="inline-start" />
                开始绘制
              </Button>
              <Button
                nativeButton={false}
                render={<Link href="#workflow" />}
                size="lg"
                variant="outline">
                看看它怎么工作
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
            <div className="mt-8 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <span className="home-live-dot" />
              <span>绘制、回放、导出都在这一页发生</span>
            </div>
          </div>
          <HeroDemo />
        </div>
      </section>

      <section
        id="workflow"
        aria-labelledby="workflow-title"
        className="scroll-mt-16 bg-background py-20 md:py-28">
        <div className="mx-auto w-full max-w-[1240px] px-5 md:px-8">
          <div className="grid gap-8 md:grid-cols-[0.8fr_1.2fr] md:items-end">
            <div>
              <Badge variant="secondary">三步完成</Badge>
              <h2
                id="workflow-title"
                className="mt-4 max-w-[520px] text-3xl leading-tight font-bold tracking-normal md:text-5xl">
                从空白画布到可以分享的动画
              </h2>
            </div>
            <p className="max-w-[600px] text-base leading-7 text-muted-foreground md:justify-self-end md:text-lg">
              Dranimo
              围绕笔画本身工作，不需要逐帧搭建。画完之后调整播放方式，再选择需要的文件格式。
            </p>
          </div>

          <div className="mt-14 grid border-y border-border md:grid-cols-3">
            {WORKFLOW.map(
              ({ number, title, description, icon: Icon, accent }) => (
                <article
                  key={number}
                  className="home-workflow-step border-b border-border py-8 last:border-b-0 md:border-r md:border-b-0 md:px-8 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
                  data-accent={accent}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-muted-foreground">
                      {number}
                    </span>
                    <span className="home-workflow-icon grid size-10 place-items-center rounded-md">
                      <Icon size={19} />
                    </span>
                  </div>
                  <h3 className="mt-12 text-xl font-bold">{title}</h3>
                  <p className="mt-3 max-w-[330px] text-sm leading-6 text-muted-foreground">
                    {description}
                  </p>
                  <div className="home-workflow-motion mt-8" aria-hidden="true">
                    <span />
                  </div>
                </article>
              ),
            )}
          </div>
        </div>
      </section>

      <section
        id="features"
        aria-labelledby="features-title"
        className="home-feature-band scroll-mt-16 border-y border-border py-20 md:py-28">
        <div className="mx-auto grid w-full max-w-[1240px] gap-12 px-5 md:px-8 lg:grid-cols-[0.72fr_1.28fr]">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <Badge variant="outline">当前功能</Badge>
            <h2
              id="features-title"
              className="mt-4 text-3xl leading-tight font-bold tracking-normal md:text-5xl">
              简单的入口，够用的控制
            </h2>
            <p className="mt-5 max-w-[430px] text-base leading-7 text-muted-foreground">
              工具栏保持安静，需要精调时再打开参数。画布始终是整个工作区的中心。
            </p>
          </div>

          <div className="grid border-t border-border sm:grid-cols-2">
            {CAPABILITIES.map(({ title, description, icon: Icon }, index) => (
              <article
                key={title}
                className="home-capability border-b border-border py-8 sm:px-8 sm:even:border-l">
                <div className="flex items-start justify-between gap-5">
                  <Icon size={22} />
                  <span className="font-mono text-[10px] text-muted-foreground">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-16 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-local-band border-b border-border">
        <div className="mx-auto grid min-h-[320px] w-full max-w-[1240px] gap-10 px-5 py-16 md:grid-cols-[0.75fr_1.25fr] md:items-center md:px-8">
          <div className="home-local-visual" aria-hidden="true">
            <div className="home-local-backdrop home-local-backdrop-one" />
            <div className="home-local-backdrop home-local-backdrop-two" />
            <div className="home-local-window">
              <div className="home-local-window-top">
                <div className="home-local-window-dots">
                  <span />
                  <span />
                  <span />
                </div>
                <span className="home-local-window-title">
                  dranimo / 本地项目
                </span>
                <span className="home-local-window-status">本地</span>
              </div>
              <div className="home-local-window-body">
                <div className="home-local-lock">
                  <LockKeyhole size={30} strokeWidth={1.8} />
                </div>
                <div className="home-local-lines">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <div className="home-local-window-footer">
                <span>仅保存在此设备</span>
                <span className="home-local-check">
                  <Check size={12} />
                </span>
              </div>
            </div>
            <div className="home-local-note">
              <FolderClock size={14} strokeWidth={2} />
              最近保存 · 刚刚
            </div>
          </div>
          <div>
            <Badge variant="secondary">
              <Check data-icon="inline-start" />
              自动保存
            </Badge>
            <h2 className="mt-5 max-w-[760px] text-3xl leading-tight font-bold tracking-normal md:text-5xl">
              你的画布，留在你的浏览器里
            </h2>
            <p className="mt-5 max-w-[650px] text-base leading-7">
              项目默认保存在本地，不会自动上传。新建、重命名、复制和继续上次创作都不需要账号。
            </p>
          </div>
        </div>
      </section>

      <section
        id="formats"
        aria-labelledby="formats-title"
        className="scroll-mt-16 overflow-hidden py-20 md:py-28">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-5 md:flex-row md:items-end md:justify-between md:px-8">
          <div>
            <Badge variant="secondary">一次绘制，多种输出</Badge>
            <h2
              id="formats-title"
              className="mt-4 text-3xl leading-tight font-bold tracking-normal md:text-5xl">
              从绘制到透明视频素材
            </h2>
          </div>
          <p className="max-w-[460px] text-sm leading-6 text-muted-foreground md:text-right">
            静态、矢量、网页视频、通用视频与带 Alpha
            通道的剪辑素材都可以从同一画布导出。
          </p>
        </div>

        <div className="home-format-loop mt-14" aria-hidden="true">
          <div className="home-format-track">
            {FORMAT_LOOP.map(({ id, format, label }) => (
              <div className="home-format-item" key={id}>
                <strong>{format}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="sr-only">
          支持 PNG 静态图片、SVG 矢量图形、WebM 网页动画、MP4 通用视频和透明 MOV
          素材。
        </p>
      </section>

      <Separator />

      <section className="home-final-cta py-20 md:py-28">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-10 px-5 md:flex-row md:items-end md:justify-between md:px-8">
          <div>
            <Sparkles size={32} />
            <h2 className="mt-8 max-w-[760px] text-4xl leading-tight font-black tracking-normal md:text-6xl">
              下一笔，现在就可以动起来
            </h2>
          </div>
          <Button
            nativeButton={false}
            render={<Link href="/editor" />}
            size="lg"
            variant="secondary">
            打开空白画布
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </section>

      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-5 py-7 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-8">
          <Brand />
          <span>本地优先 · 自动保存 · 无需登录</span>
        </div>
      </footer>
    </main>
  )
}
