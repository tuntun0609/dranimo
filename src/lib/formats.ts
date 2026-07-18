export const EXPORT_FORMATS = [
  { format: "PNG", short: "静态", long: "静态图片" },
  { format: "SVG", short: "矢量", long: "矢量图形" },
  { format: "WebM", short: "网页", long: "网页动画" },
  { format: "MP4", short: "通用", long: "通用视频" },
  { format: "MOV", short: "透明", long: "透明素材" },
] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];
