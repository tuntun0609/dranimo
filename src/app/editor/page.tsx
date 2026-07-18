import type { Metadata } from "next";
import DranimoEditor from "@/components/DranimoEditor";

export const metadata: Metadata = {
  title: "编辑器",
  description: "在 Dranimo 中绘制、回放并导出手绘动画。",
};

export default function EditorPage() {
  return <DranimoEditor />;
}
