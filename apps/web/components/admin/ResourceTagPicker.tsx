"use client";

import { Plus, Tag, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getAdminRequestHeaders } from "@/lib/admin-session";
import { API_BASE_URL } from "@/lib/api-config";
import type { ResourceTag } from "@/lib/types";

type ResourceTagPickerProps = {
  value: number[];
  onChange: (value: number[]) => void;
  disabled?: boolean;
  label?: string;
  helperText?: string;
  className?: string;
};

function uniqueIds(ids: number[]) {
  return Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
}

export function ResourceTagPicker({
  value,
  onChange,
  disabled,
  label = "资源标签",
  helperText = "只能选择当前机构类型下的标签，也可以创建新的标签。",
  className = ""
}: ResourceTagPickerProps) {
  const [tags, setTags] = useState<ResourceTag[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [status, setStatus] = useState("");
  const selectedIds = useMemo(() => new Set(uniqueIds(value)), [value]);

  async function loadTags() {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/tags`, {
        headers: getAdminRequestHeaders(),
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setTags((await response.json()) as ResourceTag[]);
      setStatus("");
    } catch {
      setStatus("标签读取失败，请确认后端服务正在运行。");
    }
  }

  useEffect(() => {
    void loadTags();
  }, []);

  function toggleTag(tagId: number) {
    if (disabled) {
      return;
    }
    if (selectedIds.has(tagId)) {
      onChange(value.filter((id) => id !== tagId));
      return;
    }
    onChange(uniqueIds([...value, tagId]));
  }

  async function createTag() {
    const name = newTagName.trim();
    if (!name || disabled) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/admin/tags`, {
        method: "POST",
        headers: getAdminRequestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }

      const created = (await response.json()) as ResourceTag;
      setTags((current) => {
        const exists = current.some((tagItem) => tagItem.id === created.id);
        return exists ? current.map((tagItem) => (tagItem.id === created.id ? created : tagItem)) : [...current, created];
      });
      onChange(uniqueIds([...value, created.id]));
      setNewTagName("");
      setStatus("标签已创建。");
    } catch {
      setStatus("标签创建失败，请确认名称没有重复。");
    }
  }

  const selectedTags = tags.filter((tagItem) => selectedIds.has(tagItem.id));
  const unselectedTags = tags.filter((tagItem) => !selectedIds.has(tagItem.id));

  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 ${className}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-lg font-black text-ink">
            <Tag size={18} className="text-mint" />
            {label}
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-500">{helperText}</p>
        </div>
        <div className="flex min-w-0 gap-2">
          <input
            className="focus-ring min-w-0 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-ink disabled:bg-slate-50 disabled:text-slate-400"
            value={newTagName}
            disabled={disabled}
            placeholder="创建新标签"
            onChange={(event) => setNewTagName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void createTag();
              }
            }}
          />
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-mint px-4 py-3 text-sm font-black text-white shadow-soft disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            disabled={disabled || !newTagName.trim()}
            onClick={() => void createTag()}
          >
            <Plus size={16} />
            添加
          </button>
        </div>
      </div>

      {selectedTags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {selectedTags.map((tagItem) => (
            <button
              key={tagItem.id}
              type="button"
              disabled={disabled}
              onClick={() => toggleTag(tagItem.id)}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-sm font-black text-mint disabled:cursor-not-allowed"
            >
              {tagItem.name}
              <X size={14} />
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {unselectedTags.map((tagItem) => (
          <button
            key={tagItem.id}
            type="button"
            disabled={disabled}
            onClick={() => toggleTag(tagItem.id)}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600 transition hover:border-mint hover:text-mint disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:text-slate-600"
          >
            {tagItem.name}
          </button>
        ))}
        {tags.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm font-semibold text-slate-500">
            当前机构类型还没有标签，可以先创建一个。
          </div>
        ) : null}
      </div>

      {status ? <p className="mt-3 text-sm font-semibold text-slate-500">{status}</p> : null}
    </section>
  );
}
