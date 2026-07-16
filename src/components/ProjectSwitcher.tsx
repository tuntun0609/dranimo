"use client";

import {
  Check,
  ChevronDown,
  Copy,
  FolderOpen,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { ProjectSummary } from "@/lib/types";

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
    <div className="project-switcher topbar-center">
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className="project-switcher-trigger"
              aria-label="打开项目列表"
              title={activeProject?.name ?? "项目"}
              disabled={disabled}
            />
          }
        >
          <span className="project-switcher-desktop">
            <span className="project-switcher-name">
              {activeProject?.name ?? "untitled animation"}
            </span>
            <ChevronDown size={14} />
          </span>
          <FolderOpen className="project-switcher-mobile" size={18} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="project-menu">
          <div className="project-menu-head">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="project-menu-label">
                <strong>项目</strong>
                <span>{projects.length} 个本地项目</span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="project-new-button"
              disabled={disabled}
              onClick={() => {
                if (onCreate()) setOpen(false);
              }}
            >
              <Plus size={15} />
              新建
            </Button>
          </div>
          <DropdownMenuSeparator />
          <div className="project-list">
            {projects.map((project) => {
              const active = project.id === activeProjectId;
              const editing = project.id === editingId;
              return (
                <div
                  className={`project-row ${active ? "active" : ""}`}
                  key={project.id}
                >
                  {editing ? (
                    <Input
                      className="project-rename-input"
                      value={draftName}
                      maxLength={60}
                      aria-label="项目名称"
                      onChange={(event) => setDraftName(event.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(event) => {
                        // DropdownMenu has typeahead keyboard handling; do not let it
                        // consume Latin letters or digits while editing a project name.
                        event.stopPropagation();
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitRename();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setEditingId(null);
                        }
                      }}
                      onKeyUp={(event) => event.stopPropagation()}
                    />
                  ) : (
                    <DropdownMenuItem
                      className="project-row-main"
                      disabled={disabled}
                      onClick={(event) => {
                        const success = active || onSelect(project.id);
                        if (!success) event.preventDefault();
                      }}
                    >
                      <span className="project-active-mark">
                        {active && <Check size={13} />}
                      </span>
                      <span className="project-row-copy">
                        <strong>{project.name}</strong>
                        <small>
                          更新于 {formatUpdatedAt(project.updatedAt)}
                        </small>
                      </span>
                    </DropdownMenuItem>
                  )}
                  {!editing && (
                    <div className="project-row-actions">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`重命名 ${project.name}`}
                        title="重命名"
                        disabled={disabled}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          startRename(project);
                        }}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`复制 ${project.name}`}
                        title="复制"
                        disabled={disabled}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (onDuplicate(project.id)) setOpen(false);
                        }}
                      >
                        <Copy size={14} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`删除 ${project.name}`}
                        title="删除"
                        disabled={disabled}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setDeleteTarget(project);
                        }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Badge
        variant={savedState === "未保存" ? "destructive" : "secondary"}
        className="saved-state"
      >
        {savedState}
      </Badge>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={handleDeleteDialogChange}
      >
        <DialogContent className="confirm-modal" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>删除项目？</DialogTitle>
            <DialogDescription>
              “{deleteTarget?.name}”及其全部笔画将从当前浏览器中删除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!deleteTarget || !onDelete(deleteTarget.id)) return;
                setDeleteTarget(null);
                setOpen(false);
              }}
            >
              <Trash2 size={15} />
              删除项目
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
