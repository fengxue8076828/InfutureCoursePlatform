"use client";

import { Filter, RotateCcw, Tag } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { API_BASE_URL } from "@/lib/api-config";
import type { ResourceTag } from "@/lib/types";

export type ResourceTagFilterValue = {
  institutionCategory: string;
  tagIds: number[];
};

type ResourceTagFiltersProps = {
  value: ResourceTagFilterValue;
  onChange: (value: ResourceTagFilterValue) => void;
  className?: string;
  title?: string;
  compact?: boolean;
  showCategorySelect?: boolean;
};

export const institutionCategoryOptions = [
  { value: "", label: "\u5168\u90e8\u673a\u6784\u7c7b\u578b" },
  { value: "tutoring", label: "\u8bfe\u5916\u6559\u8f85\u7c7b" },
  { value: "it", label: "IT\u6559\u80b2\u7c7b" },
  { value: "language", label: "\u8bed\u8a00\u6559\u80b2\u7c7b" },
  { value: "art", label: "\u827a\u672f\u6559\u80b2\u7c7b" }
];

function normalizeIds(ids: number[]) {
  return Array.from(new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id)))).sort((a, b) => a - b);
}

export function ResourceTagFilters({
  value,
  onChange,
  className = "",
  title = "\u6807\u7b7e\u7b5b\u9009",
  compact = false,
  showCategorySelect = true
}: ResourceTagFiltersProps) {
  const [tags, setTags] = useState<ResourceTag[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const selectedIds = useMemo(() => normalizeIds(value.tagIds), [value.tagIds]);
  const selectedIdsRef = useRef(selectedIds);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let isActive = true;
    const institutionCategory = value.institutionCategory;

    if (!institutionCategory) {
      setTags([]);
      if (selectedIdsRef.current.length) {
        onChangeRef.current({ institutionCategory: "", tagIds: [] });
      }
      return;
    }

    async function loadTags() {
      setIsLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/tags?institution_category=${encodeURIComponent(institutionCategory)}`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          throw new Error("Tag API unavailable");
        }
        const nextTags = (await response.json()) as ResourceTag[];
        if (!isActive) {
          return;
        }
        setTags(nextTags);
        const allowedIds = new Set(nextTags.map((tag) => tag.id));
        const nextSelectedIds = selectedIdsRef.current.filter((id) => allowedIds.has(id));
        if (nextSelectedIds.length !== selectedIdsRef.current.length) {
          onChangeRef.current({ institutionCategory, tagIds: nextSelectedIds });
        }
      } catch {
        if (isActive) {
          setTags([]);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadTags();
    return () => {
      isActive = false;
    };
  }, [value.institutionCategory]);

  function updateCategory(institutionCategory: string) {
    onChange({ institutionCategory, tagIds: [] });
  }

  function toggleTag(tagId: number) {
    const nextIds = selectedIds.includes(tagId)
      ? selectedIds.filter((id) => id !== tagId)
      : [...selectedIds, tagId];
    onChange({ institutionCategory: value.institutionCategory, tagIds: normalizeIds(nextIds) });
  }

  function reset() {
    onChange(showCategorySelect ? { institutionCategory: "", tagIds: [] } : { ...value, tagIds: [] });
  }

  const hasFilters = showCategorySelect ? Boolean(value.institutionCategory || selectedIds.length) : Boolean(selectedIds.length);

  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-mint/12 text-mint">
            <Filter size={17} />
          </span>
          <div>
            <p className="text-sm font-black text-ink">{title}</p>
            {!compact ? (
              <p className="mt-0.5 text-xs font-semibold text-slate-500">
                {"\u5148\u9009\u673a\u6784\u7c7b\u578b\uff0c\u518d\u7ec4\u5408\u591a\u4e2a\u6807\u7b7e\u7b5b\u9009\u8d44\u6e90\u3002"}
              </p>
            ) : null}
          </div>
        </div>
        {hasFilters ? (
          <button
            type="button"
            onClick={reset}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:border-coral hover:text-coral"
          >
            <RotateCcw size={14} />
            {"\u91cd\u7f6e"}
          </button>
        ) : null}
      </div>

      <div className={`mt-4 grid gap-3 ${showCategorySelect ? "md:grid-cols-[16rem_1fr]" : ""}`}>
        {showCategorySelect ? (
          <select
            value={value.institutionCategory}
            onChange={(event) => updateCategory(event.target.value)}
            className="focus-ring h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none"
          >
            {institutionCategoryOptions.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}

        <div className="min-h-12 rounded-xl border border-slate-100 bg-slate-50 p-2">
          {!value.institutionCategory ? (
            <p className="px-2 py-2 text-sm font-semibold text-slate-500">
              {"\u9009\u62e9\u673a\u6784\u7c7b\u578b\u540e\u663e\u793a\u53ef\u7528\u6807\u7b7e\u3002"}
            </p>
          ) : isLoading ? (
            <p className="px-2 py-2 text-sm font-semibold text-slate-500">{"\u6b63\u5728\u8bfb\u53d6\u6807\u7b7e..."}</p>
          ) : tags.length ? (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isSelected = selectedIds.includes(tag.id);
                return (
                  <button
                    type="button"
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-black transition ${
                      isSelected
                        ? "bg-ink text-white shadow-sm"
                        : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-coral"
                    }`}
                  >
                    <Tag size={13} />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="px-2 py-2 text-sm font-semibold text-slate-500">
              {"\u8fd9\u4e2a\u673a\u6784\u7c7b\u578b\u6682\u65e0\u6807\u7b7e\u3002"}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
