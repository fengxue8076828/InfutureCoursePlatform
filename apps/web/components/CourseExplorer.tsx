"use client";

import { Building2, Grid2X2, Layers3, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { CourseCard } from "./CourseCard";
import { ResourceTagFilters } from "./ResourceTagFilters";
import { getDifficultyOptionsForInstitution, normalizeInstitutionCategory } from "@/lib/difficulty";
import { reorderByRecommendation, useRecommendationFeed } from "@/lib/recommendations";
import type { Course, CourseCategory, Institution } from "@/lib/types";

const ALL_OPTION = "__all__";

const institutionCategoryLabels: Record<string, string> = {
  language: "\u8bed\u8a00\u6559\u80b2\u7c7b",
  it: "IT\u6559\u80b2\u7c7b",
  tutoring: "\u8bfe\u5916\u8865\u4e60\u7c7b",
  art: "\u827a\u672f\u6559\u80b2\u7c7b",
  other: "\u5176\u4ed6\u7c7b"
};

function displayOption(value: string) {
  return value === ALL_OPTION ? "\u5168\u90e8" : value;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "zh-Hans-CN")
  );
}

function buildCourseCategoryLabel(category: CourseCategory, categories: CourseCategory[]) {
  const parent = category.parent_id ? categories.find((item) => item.id === category.parent_id) : null;
  return parent ? `${parent.name} / ${category.name}` : category.name;
}

function selectableCourseCategoryLabels(categories: CourseCategory[]) {
  const activeCategories = categories.filter((category) => category.is_active);
  const parentIds = new Set(
    activeCategories.map((category) => category.parent_id).filter((id): id is number => typeof id === "number")
  );

  return activeCategories
    .filter((category) => !parentIds.has(category.id))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "zh-Hans-CN") || a.id - b.id)
    .map((category) => buildCourseCategoryLabel(category, activeCategories));
}

function optionButtonClass(isActive: boolean) {
  return `focus-ring flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
    isActive
      ? "bg-ink font-bold text-white shadow-sm"
      : "bg-slate-50 font-semibold text-slate-600 hover:bg-slate-100"
  }`;
}

function pillButtonClass(isActive: boolean) {
  return `focus-ring min-h-10 rounded-lg px-3 py-2 text-sm font-bold transition ${
    isActive ? "bg-coral text-white shadow-sm" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
  }`;
}

function getInstitutionCategory(institution?: Institution) {
  return normalizeInstitutionCategory(institution?.category);
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
  const [selectedInstitutionCategory, setSelectedInstitutionCategory] = useState(ALL_OPTION);
  const [selectedInstitutionSlug, setSelectedInstitutionSlug] = useState(ALL_OPTION);
  const [selectedCourseCategory, setSelectedCourseCategory] = useState(ALL_OPTION);
  const [selectedLevel, setSelectedLevel] = useState(ALL_OPTION);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

  const institutionsBySlug = useMemo(
    () => new Map(institutions.map((institution) => [institution.slug, institution])),
    [institutions]
  );

  const institutionCategoryOptions = useMemo(() => {
    const categoriesFromInstitutions = institutions.map((institution) => getInstitutionCategory(institution));
    const categoriesFromCourses = courses.map((course) => getInstitutionCategory(course.institution));
    const categories = uniqueSorted([...categoriesFromInstitutions, ...categoriesFromCourses]);
    const orderedCategories = ["language", "it", "tutoring", "art", "other"].filter((category) =>
      categories.includes(category)
    );
    return [ALL_OPTION, ...orderedCategories];
  }, [courses, institutions]);

  const institutionsInCategory = useMemo(() => {
    if (selectedInstitutionCategory === ALL_OPTION) {
      return institutions;
    }
    return institutions.filter((institution) => getInstitutionCategory(institution) === selectedInstitutionCategory);
  }, [institutions, selectedInstitutionCategory]);

  const institutionOptions = useMemo(
    () => [
      { label: "\u5168\u90e8", value: ALL_OPTION },
      ...institutionsInCategory.map((institution) => ({ label: institution.name, value: institution.slug }))
    ],
    [institutionsInCategory]
  );

  const coursesAfterInstitutionScope = useMemo(
    () =>
      courses.filter((course) => {
        const institution = institutionsBySlug.get(course.institution.slug) ?? course.institution;
        const institutionCategoryMatch =
          selectedInstitutionCategory === ALL_OPTION || getInstitutionCategory(institution) === selectedInstitutionCategory;
        const institutionMatch = selectedInstitutionSlug === ALL_OPTION || course.institution.slug === selectedInstitutionSlug;
        return institutionCategoryMatch && institutionMatch;
      }),
    [courses, institutionsBySlug, selectedInstitutionCategory, selectedInstitutionSlug]
  );

  const courseCategoryOptions = useMemo(() => {
    const configuredLabels = selectableCourseCategoryLabels(courseCategories);
    const usedCourseCategories = uniqueSorted(coursesAfterInstitutionScope.map((course) => course.category));
    const labels = configuredLabels.length > 0
      ? configuredLabels.filter((label) => usedCourseCategories.includes(label))
      : usedCourseCategories;
    const effectiveLabels = labels.length > 0 ? labels : usedCourseCategories;
    return [ALL_OPTION, ...effectiveLabels];
  }, [courseCategories, coursesAfterInstitutionScope]);

  const showLevelFilter = selectedInstitutionCategory !== ALL_OPTION;
  const levelOptions = useMemo(() => {
    if (!showLevelFilter) {
      return [];
    }
    return [ALL_OPTION, ...getDifficultyOptionsForInstitution(selectedInstitutionCategory)];
  }, [selectedInstitutionCategory, showLevelFilter]);

  const effectiveSelectedInstitutionSlug = institutionOptions.some((option) => option.value === selectedInstitutionSlug)
    ? selectedInstitutionSlug
    : ALL_OPTION;
  const effectiveSelectedCourseCategory = courseCategoryOptions.includes(selectedCourseCategory)
    ? selectedCourseCategory
    : ALL_OPTION;
  const effectiveSelectedLevel = showLevelFilter && levelOptions.includes(selectedLevel) ? selectedLevel : ALL_OPTION;

  const filteredCourses = useMemo(
    () =>
      coursesAfterInstitutionScope.filter((course) => {
        const courseCategoryMatch =
          effectiveSelectedCourseCategory === ALL_OPTION || course.category === effectiveSelectedCourseCategory;
        const levelMatch = !showLevelFilter || effectiveSelectedLevel === ALL_OPTION || course.level === effectiveSelectedLevel;
        const courseTagIds = new Set((course.tag_list ?? []).map((tag) => tag.id));
        const tagMatch = selectedTagIds.length === 0 || selectedTagIds.some((tagId) => courseTagIds.has(tagId));
        return courseCategoryMatch && levelMatch && tagMatch;
      }),
    [coursesAfterInstitutionScope, effectiveSelectedCourseCategory, effectiveSelectedLevel, selectedTagIds, showLevelFilter]
  );

  const recommendationFeed = useRecommendationFeed();
  const recommendedCourses = useMemo(
    () => reorderByRecommendation(filteredCourses, recommendationFeed?.orders.courses),
    [filteredCourses, recommendationFeed]
  );

  const hasActiveFilters =
    selectedInstitutionCategory !== ALL_OPTION ||
    effectiveSelectedInstitutionSlug !== ALL_OPTION ||
    effectiveSelectedCourseCategory !== ALL_OPTION ||
    effectiveSelectedLevel !== ALL_OPTION ||
    selectedTagIds.length > 0;

  function selectInstitutionCategory(category: string) {
    setSelectedInstitutionCategory(category);
    setSelectedInstitutionSlug(ALL_OPTION);
    setSelectedCourseCategory(ALL_OPTION);
    setSelectedLevel(ALL_OPTION);
    setSelectedTagIds([]);
  }

  function selectInstitution(slug: string) {
    setSelectedInstitutionSlug(slug);
    setSelectedCourseCategory(ALL_OPTION);
    setSelectedLevel(ALL_OPTION);
    setSelectedTagIds([]);
  }

  function resetFilters() {
    setSelectedInstitutionCategory(ALL_OPTION);
    setSelectedInstitutionSlug(ALL_OPTION);
    setSelectedCourseCategory(ALL_OPTION);
    setSelectedLevel(ALL_OPTION);
    setSelectedTagIds([]);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <aside className="panel rounded-lg p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-base font-bold text-ink">
            <SlidersHorizontal size={18} />
            {"\u8bfe\u7a0b\u7b5b\u9009"}
          </div>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:border-coral hover:text-coral"
            >
              <RotateCcw size={14} />
              {"\u91cd\u7f6e"}
            </button>
          ) : null}
        </div>

        <div className="mt-5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-400">
            <Grid2X2 size={15} />
            {"\u673a\u6784\u7c7b\u522b"}
          </div>
          <div className="mt-3 grid max-h-72 gap-2 overflow-auto pr-1">
            {institutionCategoryOptions.map((category) => (
              <button
                type="button"
                key={category}
                onClick={() => selectInstitutionCategory(category)}
                className={optionButtonClass(selectedInstitutionCategory === category)}
              >
                <span className="min-w-0 truncate">
                  {category === ALL_OPTION ? "\u5168\u90e8\u673a\u6784\u7c7b\u522b" : institutionCategoryLabels[category] ?? category}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-400">
            <Building2 size={15} />
            {"\u673a\u6784"}
          </div>
          <div className="mt-3 grid max-h-72 gap-2 overflow-auto pr-1">
            {institutionOptions.map((institution) => (
              <button
                type="button"
                key={institution.value}
                onClick={() => selectInstitution(institution.value)}
                className={optionButtonClass(effectiveSelectedInstitutionSlug === institution.value)}
              >
                <span className="min-w-0 truncate">{institution.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-400">
            <Layers3 size={15} />
            {"\u8bfe\u7a0b\u7c7b\u522b"}
          </div>
          <div className="mt-3 grid max-h-72 gap-2 overflow-auto pr-1">
            {courseCategoryOptions.map((category) => (
              <button
                type="button"
                key={category}
                onClick={() => {
                  setSelectedCourseCategory(category);
                  setSelectedLevel(ALL_OPTION);
                }}
                className={optionButtonClass(effectiveSelectedCourseCategory === category)}
              >
                <span className="min-w-0 truncate">{displayOption(category)}</span>
              </button>
            ))}
          </div>
        </div>

        {showLevelFilter ? (
          <div className="mt-6">
            <p className="text-xs font-bold uppercase text-slate-400">{"\u7ea7\u522b"}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {levelOptions.map((level) => (
                <button
                  type="button"
                  key={level}
                  onClick={() => setSelectedLevel(level)}
                  className={pillButtonClass(effectiveSelectedLevel === level)}
                >
                  {displayOption(level)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {showLevelFilter ? (
          <ResourceTagFilters
            value={{ institutionCategory: selectedInstitutionCategory, tagIds: selectedTagIds }}
            onChange={(nextValue) => setSelectedTagIds(nextValue.tagIds)}
            title={"\u8d44\u6e90\u6807\u7b7e"}
            compact
            showCategorySelect={false}
            className="mt-6 shadow-none"
          />
        ) : null}
      </aside>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink">{"\u8bfe\u7a0b\u5217\u8868"}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {"\u5171 "}
              {filteredCourses.length}
              {" \u95e8\u8bfe\u7a0b\uff0c\u53ef\u6309\u8bfe\u7a0b\u8bbe\u7f6e\u8ba2\u9605\u4ef7\u683c\u3002"}
            </p>
          </div>
        </div>

        {courses.length === 0 ? (
          <div className="panel rounded-lg border-dashed p-10 text-center text-slate-600">
            {"\u5f53\u524d\u6570\u636e\u5e93\u8fd8\u6ca1\u6709\u5df2\u53d1\u5e03\u8bfe\u7a0b\u3002"}
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="panel rounded-lg border-dashed p-10 text-center text-slate-600">
            {"\u6ca1\u6709\u627e\u5230\u7b26\u5408\u6761\u4ef6\u7684\u8bfe\u7a0b\u3002"}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recommendedCourses.map((course) => (
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
