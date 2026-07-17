"use client";

import {
  Check,
  ChevronDown,
  Copy,
  FolderOpen,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ProjectSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ProjectSwitcherProps {
  projects: ProjectSummary[];
  activeProjectId: string;
  savedState: string;
  disabled?: boolean;
  onCreate: () => boolean;
  onSelect: (projectId: string) => boolean;
  onRename: (projectId: string, name: string) => boolean;
  onDuplicate: (projectId: string) => boolean;
  onDelete: (projectId: string) => boolean;
}

function formatUpdatedAt(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return date.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

export default function ProjectSwitcher({
  projects,
  activeProjectId,
  savedState,
  disabled,
  onCreate,
  onSelect,
  onRename,
  onDuplicate,
  onDelete,
}: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const activeProject =
    projects.find((project) => project.id === activeProjectId) ?? projects[0];

  useEffect(() => {
    if (!disabled) return;
    setOpen(false);
    setDeleteTarget(null);
    setEditingId(null);
  }, [disabled]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setEditingId(null);
  };

  const startRename = (project: ProjectSummary) => {
    setEditingId(project.id);
    setDraftName(project.name);
  };

  const commitRename = () => {
    if (!editingId) return;
    const name = draftName.trim().slice(0, 60);
    if (!name) return;
    if (onRename(editingId, name)) setEditingId(null);
  };

  const handleDeleteDialogChange = (nextOpen: boolean) => {
    if (!nextOpen) setDeleteTarget(null);
  };

  return (
    <div className="relative flex min-w-0 flex-1 items-center justify-center gap-2 max-sm:justify-end max-sm:gap-0">
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger
          render={
            <Button
              variant="ghost"
              className="max-w-[min(420px,100%)] min-w-0 max-sm:size-8 max-sm:px-0"
              aria-label="打开画布管理"
              title={activeProject?.name ?? "画布"}
              disabled={disabled}
            />
          }
        >
          <span className="inline-flex min-w-0 items-center gap-1.5 max-sm:hidden">
            <span className="truncate">
              {activeProject?.name ?? "untitled animation"}
            </span>
            <ChevronDown data-icon="inline-end" />
          </span>
          <FolderOpen
            data-icon="inline-start"
            className="hidden max-sm:block"
          />
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>画布管理</DialogTitle>
            <DialogDescription>
              {projects.length} 个本地画布，数据仅保存在当前浏览器中。
            </DialogDescription>
          </DialogHeader>
          <ScrollArea
            className={cn("pr-2", projects.length > 5 && "h-[min(60vh,28rem)]")}
          >
            <ItemGroup className="gap-2">
              {projects.map((project) => {
                const active = project.id === activeProjectId;
                const editing = project.id === editingId;
                return (
                  <Item
                    key={project.id}
                    variant={active ? "muted" : "outline"}
                    size="sm"
                    className="relative"
                    render={<li />}
                  >
                    <ItemMedia variant="icon">
                      {active ? <Check /> : <FolderOpen />}
                    </ItemMedia>
                    {editing ? (
                      <ItemContent className="min-w-0">
                        <FieldGroup className="gap-1">
                          <Field>
                            <FieldLabel
                              htmlFor={`project-name-${project.id}`}
                              className="sr-only"
                            >
                              画布名称
                            </FieldLabel>
                            <Input
                              id={`project-name-${project.id}`}
                              value={draftName}
                              maxLength={60}
                              autoFocus
                              onChange={(event) =>
                                setDraftName(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  commitRename();
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  setEditingId(null);
                                }
                              }}
                            />
                          </Field>
                        </FieldGroup>
                      </ItemContent>
                    ) : (
                      <>
                        <ItemContent className="min-w-0">
                          <ItemTitle className="max-w-full">
                            <span className="truncate">{project.name}</span>
                          </ItemTitle>
                          <ItemDescription>
                            更新于 {formatUpdatedAt(project.updatedAt)}
                          </ItemDescription>
                        </ItemContent>
                        <button
                          type="button"
                          className="absolute inset-0 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          aria-label={
                            active
                              ? `${project.name}（当前画布）`
                              : `打开 ${project.name}`
                          }
                          disabled={disabled}
                          onClick={() => {
                            if (active || onSelect(project.id)) setOpen(false);
                          }}
                        />
                      </>
                    )}
                    <ItemActions className="relative z-10">
                      {editing ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label="保存画布名称"
                            onClick={commitRename}
                          >
                            <Check data-icon="inline-start" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label="取消重命名"
                            onClick={() => setEditingId(null)}
                          >
                            <X data-icon="inline-start" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`重命名 ${project.name}`}
                            title="重命名"
                            disabled={disabled}
                            onClick={() => startRename(project)}
                          >
                            <Pencil data-icon="inline-start" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`复制 ${project.name}`}
                            title="复制"
                            disabled={disabled}
                            onClick={() => {
                              if (onDuplicate(project.id)) setOpen(false);
                            }}
                          >
                            <Copy data-icon="inline-start" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`删除 ${project.name}`}
                            title="删除"
                            disabled={disabled}
                            onClick={() => setDeleteTarget(project)}
                          >
                            <Trash2 data-icon="inline-start" />
                          </Button>
                        </>
                      )}
                    </ItemActions>
                  </Item>
                );
              })}
            </ItemGroup>
          </ScrollArea>
          <DialogFooter>
            <Button
              type="button"
              variant="default"
              disabled={disabled}
              onClick={() => {
                if (onCreate()) setOpen(false);
              }}
            >
              <Plus data-icon="inline-start" />
              新建画布
            </Button>
          </DialogFooter>
          <AlertDialog
            open={Boolean(deleteTarget)}
            onOpenChange={handleDeleteDialogChange}
          >
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogMedia className="bg-destructive/10 text-destructive">
                  <Trash2 />
                </AlertDialogMedia>
                <AlertDialogTitle>删除画布？</AlertDialogTitle>
                <AlertDialogDescription>
                  “{deleteTarget?.name}”及其全部笔画将从当前浏览器中永久删除。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel variant="outline">取消</AlertDialogCancel>
                <AlertDialogAction
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    if (!deleteTarget || !onDelete(deleteTarget.id)) return;
                    setDeleteTarget(null);
                    setOpen(false);
                  }}
                >
                  <Trash2 data-icon="inline-start" />
                  删除画布
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogContent>
      </Dialog>

      <Badge
        variant={savedState === "未保存" ? "destructive" : "secondary"}
        className="text-[11px] max-sm:hidden"
      >
        {savedState}
      </Badge>
    </div>
  );
}
