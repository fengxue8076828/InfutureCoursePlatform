"use client";

import { Building2, Grid2X2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { CourseCard } from "./CourseCard";
import { getDifficultyOptionsForInstitution } from "@/lib/difficulty";
import type { Course, CourseCategory, Institution } from "@/lib/types";

const ALL_OPTION = "全部";

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "zh-Hans-CN")
  );
}

function buildCourseCategoryLabel(category: CourseCategory, categories: CourseCategory[]) {
  const parent = category.parent_id
    ? categories.find((item) => item.id === category.parent_id)
    : null;
  return parent ? `${parent.name} / ${category.name}` : category.name;
}

function selectableCourseCategoryLabels(categories: CourseCategory[]) {
  const activeCategories = categories.filter((category) => category.is_active);
  const parentIds = new Set(
    activeCategories
      .map((category) => category.parent_id)
      .filter((id): id is number => typeof id === "number")
  );

  return activeCategories
    .filter((category) => !parentIds.has(category.id))
    .sort(
      (a, b) =>
        a.position - b.position ||
        a.name.localeCompare(b.name, "zh-Hans-CN") ||
        a.id - b.id
    )
    .map((category) => buildCourseCategoryLabel(category, activeCategories));
}

function optionButtonClass(isActive: boolean) {
  return `focus-ring flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
    isActive
      ? "bg-ink font-bold text-white shadow-sm"
      : "bg-slate-50 font-semibold text-slate-600 hover:bg-slate-100"
  }`;
}

export function CourseExplorer({
  courses,
  institutions,
  courseCategories
}: {
  courses: Course[];
  institutions: Institution[];
  courseCategories: CourseCategory[];
}) {
  const [selectedCategory, setSelectedCategory] = useState(ALL_OPTION);
  const [selectedInstitutionSlug, setSelectedInstitutionSlug] = useState(ALL_OPTION);
  const [selectedLevel, setSelectedLevel] = useState(ALL_OPTION);

  const categoryOptions = useMemo(() => {
    const labels = selectableCourseCategoryLabels(courseCategories);
    return [ALL_OPTION, ...(labels.length > 0 ? labels : uniqueSorted(courses.map((course) => course.category)))];
  }, [courseCategories, courses]);

  const institutionOptions = useMemo(
    () =>
      [
        { label: ALL_OPTION, value: ALL_OPTION },
        ...institutions.map((institution) => ({
          label: institution.name,
          value: institution.slug
        }))
      ],
    [institutions]
  );

  const selectedInstitution = useMemo(
    () => institutions.find((institution) => institution.slug === selectedInstitutionSlug),
    [institutions, selectedInstitutionSlug]
  );

  const coursesBeforeLevelFilter = useMemo(
    () =>
      courses.filter((course) => {
        const categoryMatch =
          selectedCategory === ALL_OPTION || course.category === selectedCategory;
        const institutionMatch =
          selectedInstitutionSlug === ALL_OPTION ||
          course.institution.slug === selectedInstitutionSlug;
        return categoryMatch && institutionMatch;
      }),
    [courses, selectedCategory, selectedInstitutionSlug]
  );

  const levelOptions = useMemo(() => {
    if (selectedInstitution) {
      return [ALL_OPTION, ...getDifficultyOptionsForInstitution(selectedInstitution.category)];
    }

    const institutionSlugsInScope = new Set(
      coursesBeforeLevelFilter.map((course) => course.institution.slug)
    );
    const institutionCategoriesInScope = uniqueSorted(
      institutions
        .filter((institution) => institutionSlugsInScope.has(institution.slug))
        .map((institution) => institution.category)
    );

    if (institutionCategoriesInScope.length === 1) {
      return [
        ALL_OPTION,
        ...getDifficultyOptionsForInstitution(institutionCategoriesInScope[0])
      ];
    }

    return [ALL_OPTION, ...uniqueSorted(coursesBeforeLevelFilter.map((course) => course.level))];
  }, [coursesBeforeLevelFilter, institutions, selectedInstitution]);

  const effectiveSelectedLevel = levelOptions.includes(selectedLevel) ? selectedLevel : ALL_OPTION;

  const filteredCourses = useMemo(
    () =>
      coursesBeforeLevelFilter.filter(
        (course) => effectiveSelectedLevel === ALL_OPTION || course.level === effectiveSelectedLevel
      ),
    [coursesBeforeLevelFilter, effectiveSelectedLevel]
  );

  const hasActiveFilters =
    selectedCategory !== ALL_OPTION ||
    selectedInstitutionSlug !== ALL_OPTION ||
    effectiveSelectedLevel !== ALL_OPTION;

  function resetFilters() {
    setSelectedCategory(ALL_OPTION);
    setSelectedInstitutionSlug(ALL_OPTION);
    setSelectedLevel(ALL_OPTION);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <aside className="panel rounded-lg p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-base font-bold text-ink">
            <SlidersHorizontal size={18} />
            课程筛选
          </div>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:border-coral hover:text-coral"
            >
              <RotateCcw size={14} />
              重置
            </button>
          ) : null}
        </div>

        <div className="mt-5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-400">
            <Grid2X2 size={15} />
            课程类别
          </div>
          <div className="mt-3 grid max-h-72 gap-2 overflow-auto pr-1">
            {categoryOptions.map((category) => (
              <button
                type="button"
                key={category}
                onClick={() => {
                  setSelectedCategory(category);
                  setSelectedLevel(ALL_OPTION);
                }}
                className={optionButtonClass(selectedCategory === category)}
              >
                <span className="min-w-0 truncate">{category}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-400">
            <Building2 size={15} />
            机构
          </div>
          <div className="mt-3 grid max-h-72 gap-2 overflow-auto pr-1">
            {institutionOptions.map((institution) => (
              <button
                type="button"
                key={institution.value}
                onClick={() => {
                  setSelectedInstitutionSlug(institution.value);
                  setSelectedLevel(ALL_OPTION);
                }}
                className={optionButtonClass(selectedInstitutionSlug === institution.value)}
              >
                <span className="min-w-0 truncate">{institution.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <p className="text-xs font-bold uppercase text-slate-400">级别</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {levelOptions.map((level) => (
              <button
                type="button"
                key={level}
                onClick={() => setSelectedLevel(level)}
                className={`focus-ring min-h-10 rounded-lg px-3 py-2 text-sm font-bold transition ${
                  effectiveSelectedLevel === level
                    ? "bg-coral text-white shadow-sm"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink">课程列表</h1>
            <p className="mt-1 text-sm text-slate-600">
              共 {filteredCourses.length} 门课程，订阅价统一 39 欧元/月。
            </p>
          </div>
        </div>

        {courses.length === 0 ? (
          <div className="panel rounded-lg border-dashed p-10 text-center text-slate-600">
            当前数据库还没有已发布课程。
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="panel rounded-lg border-dashed p-10 text-center text-slate-600">
            没有找到符合条件的课程。
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredCourses.map((course) => (
              <div key={course.id} className="[&>a]:w-full">
                <CourseCard course={course} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
