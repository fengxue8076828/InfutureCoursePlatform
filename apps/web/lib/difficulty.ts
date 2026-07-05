export type InstitutionCategoryValue = "it" | "language" | "tutoring" | "art" | "other";

export const difficultyOptionsByInstitutionCategory: Record<InstitutionCategoryValue, string[]> = {
  language: ["A1", "A2", "B1", "B2", "C1", "C2"],
  tutoring: Array.from({ length: 12 }, (_, index) => `${index + 1}年级`),
  art: Array.from({ length: 10 }, (_, index) => `${index + 1}级`),
  it: ["简单", "中等", "复杂", "极复杂"],
  other: ["简单", "中等", "复杂", "极复杂"]
};

export function normalizeInstitutionCategory(category?: string): InstitutionCategoryValue {
  if (!category) {
    return "other";
  }

  if (category in difficultyOptionsByInstitutionCategory) {
    return category as InstitutionCategoryValue;
  }

  const labelMap: Record<string, InstitutionCategoryValue> = {
    IT教育类: "it",
    语言教育类: "language",
    课外补习类: "tutoring",
    艺术教育类: "art",
    其他类: "other"
  };

  return labelMap[category] ?? "other";
}

export function getDifficultyOptionsForInstitution(category?: string) {
  return difficultyOptionsByInstitutionCategory[normalizeInstitutionCategory(category)];
}
