"use client";

import { API_BASE_URL } from "@/lib/api-config";

import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Code2,
  Edit3,
  FlaskConical,
  FileAudio,
  FileImage,
  FileVideo,
  Plus,
  Save,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDeleteConfirmation } from "./DeleteConfirmDialog";
import { ResourceTagPicker } from "./ResourceTagPicker";

import { MathText, hasMathText } from "@/components/MathText";
import type { ResourceTag } from "@/lib/types";
import {
  adminInstitution,
  fallbackAdminQuestions,
  getDifficultyOptionsForInstitution,
  institutionCategoryOptions
} from "@/lib/admin-data";
import {
  AdminSessionUser,
  getAdminRequestHeaders,
  getAdminSessionUser
} from "@/lib/admin-session";

type QuestionTypeValue =
  | "fill_blank"
  | "single_choice"
  | "multiple_choice"
  | "writing"
  | "coding"
  | "code_review";

type QuestionStatusValue = "draft" | "saved" | "published";

type QuestionOption = {
  id?: number;
  label: string;
  text: string;
  is_correct: boolean;
  explanation?: string | null;
  position: number;
};

type QuestionMedia = {
  id?: number;
  media_type: "image" | "audio" | "video" | "handout";
  title: string;
  url: string;
  position: number;
};

type UploadMediaType = Exclude<QuestionMedia["media_type"], "handout">;

const uploadMediaOptions: Array<{
  type: UploadMediaType;
  icon: typeof FileImage;
  label: string;
  accept: string;
}> = [
  { type: "image", icon: FileImage, label: "图片", accept: "image/*" },
  { type: "audio", icon: FileAudio, label: "音频", accept: "audio/*" },
  { type: "video", icon: FileVideo, label: "视频", accept: "video/*" }
];

const MAX_STEM_MEDIA_UPLOAD_BYTES = 5 * 1024 * 1024;

type AdminQuestion = {
  id?: number;
  institution_id: number;
  course_id: number | null;
  created_by_user_id?: number | null;
  type: QuestionTypeValue;
  prompt: string;
  hint: string;
  content: {
    title?: string;
    starter_code?: string;
    tests?: string[];
    [key: string]: unknown;
  };
  answer_key: Record<string, unknown>;
  skill_area: string;
  difficulty: string;
  points: number;
  requires_manual_grading: boolean;
  is_public: boolean;
  status: QuestionStatusValue;
  tagIds: number[];
  tagList: ResourceTag[];
  tag_list?: ResourceTag[];
  options: QuestionOption[];
  media_assets: QuestionMedia[];
};

type QuestionOwnerOption = {
  id: number;
  name: string;
  role: string;
};

type CodeRunResult = {
  ok: boolean;
  passed: boolean;
  stdout: string;
  stderr: string;
  error?: string | null;
  duration_ms: number;
  tests: Array<{
    test: string;
    passed: boolean;
    message?: string;
  }>;
};

type ApiManagedUser = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
};

const localDraftIdBase = 1_000_000_000;
const QUESTION_BANK_CHANGE_EVENT = "infuture-question-bank-change";

const questionStatusLabels: Record<QuestionStatusValue, string> = {
  draft: "草稿",
  saved: "已保存",
  published: "已发布"
};

const questionStatusClasses: Record<QuestionStatusValue, string> = {
  draft: "bg-slate-100 text-slate-600",
  saved: "bg-skysoft/20 text-blue-700",
  published: "bg-mint/15 text-mint"
};

const formulaTemplateGroups = [
  {
    title: "数学",
    icon: Calculator,
    templates: [
      { label: "分数", value: "$\\frac{a}{b}$" },
      { label: "根号", value: "$\\sqrt{x}$" },
      { label: "乘方", value: "$x^2$" },
      { label: "下标", value: "$x_1$" },
      { label: "块级公式", value: "$$\\frac{x^2+1}{\\sqrt{x}}$$" }
    ]
  },
  {
    title: "物理",
    icon: Calculator,
    templates: [
      { label: "牛顿第二定律", value: "$F=ma$" },
      { label: "速度", value: "$v=\\frac{s}{t}$" },
      { label: "密度", value: "$\\rho=\\frac{m}{V}$" },
      { label: "欧姆定律", value: "$U=IR$" },
      { label: "单位", value: "$\\mathrm{m/s}$" }
    ]
  },
  {
    title: "化学",
    icon: FlaskConical,
    templates: [
      { label: "水分子", value: "\\ce{H2O}" },
      { label: "反应式", value: "\\ce{2H2 + O2 -> 2H2O}" },
      { label: "可逆反应", value: "\\ce{N2 + 3H2 <=> 2NH3}" },
      { label: "离子", value: "\\ce{SO4^{2-}}" }
    ]
  }
];

const questionTypes: Array<{
  value: QuestionTypeValue;
  label: string;
  needsOptions: boolean;
  needsCode: boolean;
}> = [
  { value: "fill_blank", label: "填空题", needsOptions: true, needsCode: false },
  { value: "single_choice", label: "单选题", needsOptions: true, needsCode: false },
  { value: "multiple_choice", label: "多选题", needsOptions: true, needsCode: false },
  { value: "writing", label: "开放式答案题", needsOptions: false, needsCode: false },
  { value: "coding", label: "代码编写题", needsOptions: false, needsCode: true }
];

function questionTypeLabel(type: QuestionTypeValue) {
  return questionTypes.find((item) => item.value === type)?.label ?? type;
}

function isCodeQuestion(type: QuestionTypeValue) {
  return type === "coding";
}

function isRetiredQuestionType(type: QuestionTypeValue) {
  return type === "code_review";
}

function notifyQuestionBankChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(QUESTION_BANK_CHANGE_EVENT));
  }
}

function createLocalDraftId() {
  return -(localDraftIdBase + Date.now());
}

function isPersistedQuestion(question: AdminQuestion) {
  return Boolean(question.id && question.id > 0);
}

function canUseQuestionType(type: QuestionTypeValue, institutionCategory: string) {
  if (isRetiredQuestionType(type)) {
    return false;
  }
  return institutionCategory === "it" || !isCodeQuestion(type);
}

function defaultQuestionTypeForInstitution(institutionCategory: string): QuestionTypeValue {
  return questionTypes.find((type) => canUseQuestionType(type.value, institutionCategory))?.value ?? "fill_blank";
}

function usesOptions(type: QuestionTypeValue) {
  return type === "fill_blank" || type === "single_choice" || type === "multiple_choice";
}

function supportsFormulaTools(institutionCategory: string) {
  return institutionCategory === "tutoring";
}

function appendFormulaTemplate(currentValue: string, template: string) {
  const trimmedValue = currentValue.trimEnd();
  if (!trimmedValue) {
    return template;
  }
  return `${trimmedValue} ${template}`;
}

function createDefaultOptions(type: QuestionTypeValue): QuestionOption[] {
  if (type === "fill_blank") {
    return [
      { label: "空1", text: "", is_correct: true, position: 1 },
      { label: "空2", text: "", is_correct: true, position: 2 }
    ];
  }
  if (type === "single_choice" || type === "multiple_choice") {
    return ["A", "B", "C", "D"].map((label, index) => ({
      label,
      text: "",
      is_correct: type === "single_choice" ? index === 0 : false,
      position: index + 1
    }));
  }
  return [];
}

function questionHasDraftContent(question: AdminQuestion) {
  const title = typeof question.content.title === "string" ? question.content.title.trim() : "";
  const rubric = typeof question.content.rubric === "string" ? question.content.rubric.trim() : "";
  const starterCode =
    typeof question.content.starter_code === "string" ? question.content.starter_code.trim() : "";
  const hasTests = Array.isArray(question.content.tests) && question.content.tests.length > 0;
  return Boolean(
    question.prompt.trim() ||
      question.hint.trim() ||
      title ||
      question.skill_area.trim() ||
      rubric ||
      starterCode ||
      hasTests ||
      question.options.some((option) => option.text.trim()) ||
      question.media_assets.some((media) => media.url.trim())
  );
}

function upsertQuestionInList(questions: AdminQuestion[], nextQuestion: AdminQuestion) {
  const exists = questions.some((question) => question.id === nextQuestion.id);
  if (exists) {
    return questions.map((question) => (question.id === nextQuestion.id ? nextQuestion : question));
  }
  return [nextQuestion, ...questions];
}

function createBlankQuestion(
  type: QuestionTypeValue,
  institutionCategory: string = adminInstitution.category,
  creatorId: number | null = null
): AdminQuestion {
  const difficultyOptions = getDifficultyOptionsForInstitution(institutionCategory);
  return {
    institution_id: adminInstitution.id,
    course_id: null,
    created_by_user_id: creatorId,
    type,
    prompt: "",
    hint: "",
    content: {
      title: "",
      starter_code: isCodeQuestion(type)
        ? "def solve(items):\n    # 在这里编写或修改代码\n    return items\n\nprint(solve([1, 2, 3]))"
        : undefined,
      tests: isCodeQuestion(type) ? ["solve([1, 3, 2]) == 3"] : undefined
    },
    answer_key: isCodeQuestion(type)
      ? {
          reference_solution: "",
          expected_output: "",
          tests: ["solve([1, 3, 2]) == 3"]
        }
      : {},
    skill_area: "",
    difficulty: difficultyOptions[0],
    points: 10,
    requires_manual_grading: type === "writing",
    is_public: true,
    status: "draft",
    tagIds: [],
    tagList: [],
    options: createDefaultOptions(type),
    media_assets: []
  };
}

function normalizeSkillArea(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed === "缁煎悎鑳藉姏" || trimmed === "ç»¼åˆè½å" ? "" : trimmed;
}

function normalizeQuestion(raw: AdminQuestion): AdminQuestion {
  return {
    ...raw,
    type: raw.type,
    course_id: raw.course_id ?? null,
    created_by_user_id: raw.created_by_user_id ?? null,
    hint: raw.hint ?? "",
    skill_area: normalizeSkillArea(raw.skill_area),
    content: raw.content ?? {},
    answer_key: raw.answer_key ?? {},
    is_public: raw.is_public ?? true,
    status: raw.status ?? "saved",
    tagIds: Array.isArray(raw.tagIds) ? raw.tagIds : (raw.tag_list ?? []).map((tag) => tag.id),
    tagList: Array.isArray(raw.tagList) ? raw.tagList : raw.tag_list ?? [],
    options: raw.options ?? [],
    media_assets: (raw.media_assets ?? []).filter((media) => media.media_type !== "handout")
  };
}

export function QuestionBankManager() {
  const [currentUser, setCurrentUser] = useState<AdminSessionUser | null>(null);
  const [ownerOptions, setOwnerOptions] = useState<QuestionOwnerOption[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeType, setActiveType] = useState<QuestionTypeValue>("fill_blank");
  const [questions, setQuestions] = useState<AdminQuestion[]>(
    fallbackAdminQuestions.map((question) => normalizeQuestion(question as unknown as AdminQuestion))
  );
  const [selectedQuestion, setSelectedQuestion] = useState<AdminQuestion>(() =>
    createBlankQuestion("fill_blank")
  );
  const [institutionCategory, setInstitutionCategory] = useState<string>(adminInstitution.category);
  const [difficultyOptions, setDifficultyOptions] = useState<string[]>(
    getDifficultyOptionsForInstitution(adminInstitution.category)
  );
  const [status, setStatus] = useState("可编辑演示数据；API 启动后会自动同步。");
  const [isSaving, setIsSaving] = useState(false);
  const [codeRunning, setCodeRunning] = useState(false);
  const [codeRunResult, setCodeRunResult] = useState<CodeRunResult | null>(null);
  const [formulaInsertTarget, setFormulaInsertTarget] = useState("prompt");
  const currentUserId = currentUser?.id ?? 0;
  const { confirmDelete, deleteConfirmDialog } = useDeleteConfirmation();
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);
  const hintInputRef = useRef<HTMLTextAreaElement | null>(null);
  const effectiveOwnerId = selectedOwnerId ?? currentUserId;
  const isSuperAdmin = currentUser?.role === "super_admin";
  const canEditQuestions = Boolean(currentUserId && effectiveOwnerId === currentUserId);
  const availableQuestionTypes = useMemo(
    () => questionTypes.filter((type) => canUseQuestionType(type.value, institutionCategory)),
    [institutionCategory]
  );

  useEffect(() => {
    window.setTimeout(() => {
      const sessionUser = getAdminSessionUser();
      setCurrentUser(sessionUser);
      setSelectedOwnerId(sessionUser?.id ?? null);
      if (sessionUser) {
        setOwnerOptions([{ id: sessionUser.id, name: sessionUser.full_name, role: sessionUser.role }]);
      }
    }, 0);
  }, []);

  useEffect(() => {
    if (!currentUser) {
      return;
    }
    const sessionUser = currentUser;
    let ignore = false;
    async function loadOwnerOptions() {
      if (!isSuperAdmin) {
        setOwnerOptions([{ id: sessionUser.id, name: sessionUser.full_name, role: sessionUser.role }]);
        setSelectedOwnerId(sessionUser.id);
        return;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/admin/users`, {
          headers: getAdminRequestHeaders(),
          cache: "no-store"
        });
        if (!response.ok || ignore) {
          return;
        }
        const users = (await response.json()) as ApiManagedUser[];
        const options = users
          .filter((user) => user.is_active && (user.role === "teacher" || user.id === sessionUser.id))
          .map((user) => ({
            id: user.id,
            name: user.full_name,
            role: user.role
          }));
        if (!options.some((option) => option.id === sessionUser.id)) {
          options.unshift({ id: sessionUser.id, name: sessionUser.full_name, role: sessionUser.role });
        }
        setOwnerOptions(options);
        setSelectedOwnerId((current) => current ?? sessionUser.id);
      } catch {
        if (!ignore) {
          setOwnerOptions([{ id: sessionUser.id, name: sessionUser.full_name, role: sessionUser.role }]);
        }
      }
    }
    void loadOwnerOptions();
    return () => {
      ignore = true;
    };
  }, [currentUser, isSuperAdmin]);

  useEffect(() => {
    if (!currentUser || !effectiveOwnerId) {
      return;
    }
    const sessionUser = currentUser;
    let ignore = false;
    async function loadAdminData() {
      let loadedCategory: string = adminInstitution.category;
      try {
        const difficultyResponse = await fetch(`${API_BASE_URL}/admin/difficulty-levels`, {
          headers: getAdminRequestHeaders(),
          cache: "no-store"
        });
        if (difficultyResponse.ok) {
          const difficultyData = (await difficultyResponse.json()) as {
            category: string;
            levels: string[];
          };
          if (!ignore && difficultyData.levels.length > 0) {
            loadedCategory = difficultyData.category;
            setInstitutionCategory(difficultyData.category);
            setDifficultyOptions(difficultyData.levels);
          }
        }

        const params = new URLSearchParams({ created_by_user_id: String(effectiveOwnerId) });
        const response = await fetch(`${API_BASE_URL}/admin/questions?${params.toString()}`, {
          headers: getAdminRequestHeaders(),
          cache: "no-store"
        });
        if (!response.ok) {
          throw new Error("API unavailable");
        }
        const data = (await response.json()) as AdminQuestion[];
        if (!ignore) {
          const normalized = data
            .map(normalizeQuestion)
            .filter((question) => canUseQuestionType(question.type, loadedCategory));
          const nextQuestion =
            normalized[0] ??
            createBlankQuestion(
              defaultQuestionTypeForInstitution(loadedCategory),
              loadedCategory,
              canEditQuestions ? sessionUser.id : effectiveOwnerId
            );
          setQuestions(normalized);
          setSelectedQuestion(nextQuestion);
          setActiveType(nextQuestion.type);
          setStatus(canEditQuestions ? "已连接 FastAPI 题库接口。" : "正在查看其他老师题目，当前为只读模式。");
        }
      } catch {
        if (!ignore) {
          setStatus("FastAPI 未连接，当前使用本地演示数据。");
        }
      }
    }
    loadAdminData();
    return () => {
      ignore = true;
    };
  }, [canEditQuestions, currentUser, effectiveOwnerId]);

  const filteredQuestions = useMemo(
    () => {
      const keyword = searchTerm.trim().toLowerCase();
      return questions.filter((question) => {
        if (question.type !== activeType || !canUseQuestionType(question.type, institutionCategory)) {
          return false;
        }
        if (!keyword) {
          return true;
        }
        const title = typeof question.content.title === "string" ? question.content.title : "";
        return [title, question.prompt, question.hint, normalizeSkillArea(question.skill_area), question.difficulty]
          .some((value) => value.toLowerCase().includes(keyword));
      });
    },
    [activeType, institutionCategory, questions, searchTerm]
  );
  const trimmedSearchTerm = searchTerm.trim();

  const activeTypeMeta =
    availableQuestionTypes.find((item) => item.value === activeType) ??
    availableQuestionTypes[0] ??
    questionTypes[0];
  const normalizedSelectedDifficulty = difficultyOptions.includes(selectedQuestion.difficulty)
    ? selectedQuestion.difficulty
    : difficultyOptions[0];
  const institutionCategoryLabel =
    institutionCategoryOptions.find((option) => option.value === institutionCategory)?.label ?? "其他类";
  const showFormulaTools = supportsFormulaTools(institutionCategory);
  const formulaTargetOptions = useMemo(() => {
    const targets = [
      { value: "prompt", label: "题干" },
      { value: "hint", label: "题目提示" }
    ];
    if (selectedQuestion.type === "single_choice" || selectedQuestion.type === "multiple_choice") {
      selectedQuestion.options.forEach((option, index) => {
        targets.push({
          value: `option:${index}`,
          label: `选项 ${option.label || index + 1}`
        });
      });
    }
    return targets;
  }, [selectedQuestion.options, selectedQuestion.type]);
  const normalizedFormulaInsertTarget = formulaTargetOptions.some((target) => target.value === formulaInsertTarget)
    ? formulaInsertTarget
    : "prompt";

  function applyQuestionChange(updater: (current: AdminQuestion) => AdminQuestion) {
    if (!canEditQuestions) {
      setStatus("当前正在查看其他老师题目，只能查看详情，不能编辑。");
      return;
    }
    const next = normalizeQuestion(updater(selectedQuestion));
    const shouldSyncDraft = questionHasDraftContent(next);
    const nextQuestion: AdminQuestion = shouldSyncDraft
      ? {
          ...next,
          id: next.id ?? createLocalDraftId(),
          status: "draft"
        }
      : next;
    setSelectedQuestion(nextQuestion);
    if (shouldSyncDraft) {
      setQuestions((current) => upsertQuestionInList(current, nextQuestion));
    }
  }

  function updateSelected(patch: Partial<AdminQuestion>) {
    applyQuestionChange((current) => ({ ...current, ...patch }));
  }

  function insertFormulaTemplate(field: "prompt" | "hint", template: string) {
    const currentValue = selectedQuestion[field] ?? "";
    const input = field === "prompt" ? promptInputRef.current : hintInputRef.current;
    const selectionStart = input?.selectionStart ?? currentValue.length;
    const selectionEnd = input?.selectionEnd ?? currentValue.length;
    const prefix = currentValue.slice(0, selectionStart);
    const suffix = currentValue.slice(selectionEnd);
    const needsLeadingSpace = prefix.length > 0 && !/\s$/.test(prefix);
    const needsTrailingSpace = suffix.length > 0 && !/^\s/.test(suffix);
    const insertion = `${needsLeadingSpace ? " " : ""}${template}${needsTrailingSpace ? " " : ""}`;
    const nextValue = `${prefix}${insertion}${suffix}`;
    updateSelected({ [field]: nextValue } as Partial<AdminQuestion>);
    window.requestAnimationFrame(() => {
      input?.focus();
      const cursor = prefix.length + insertion.length;
      input?.setSelectionRange(cursor, cursor);
    });
  }

  function insertFormulaTemplateToTarget(template: string) {
    const target = normalizedFormulaInsertTarget;
    if (target === "prompt" || target === "hint") {
      insertFormulaTemplate(target, template);
      return;
    }
    const optionIndex = Number(target.replace("option:", ""));
    const option = selectedQuestion.options[optionIndex];
    if (!option) {
      setFormulaInsertTarget("prompt");
      return;
    }
    updateOption(optionIndex, { text: appendFormulaTemplate(option.text, template) });
  }

  function updateContent(key: string, value: unknown) {
    applyQuestionChange((current) => ({
      ...current,
      content: { ...current.content, [key]: value }
    }));
  }

  function updateAnswerKey(key: string, value: unknown) {
    applyQuestionChange((current) => ({
      ...current,
      answer_key: { ...current.answer_key, [key]: value }
    }));
  }

  async function runSelectedQuestionCode() {
    if (!isCodeQuestion(selectedQuestion.type)) {
      return;
    }
    const code = selectedQuestion.content.starter_code ?? "";
    if (!code.trim()) {
      setStatus("请先填写代码。");
      setCodeRunResult(null);
      return;
    }
    setCodeRunning(true);
    setCodeRunResult(null);
    setStatus("正在运行代码...");
    try {
      const response = await fetch(`${API_BASE_URL}/admin/code/run`, {
        method: "POST",
        headers: getAdminRequestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          code,
          language: "python",
          tests: Array.isArray(selectedQuestion.content.tests) ? selectedQuestion.content.tests : []
        })
      });
      if (!response.ok) {
        setStatus(`代码运行失败：${await readApiErrorMessage(response)}`);
        return;
      }
      const payload = (await response.json()) as CodeRunResult;
      setCodeRunResult(payload);
      setStatus(
        payload.ok
          ? payload.passed
            ? "代码运行完成，测试已通过。"
            : "代码运行完成，还有测试未通过。"
          : "代码运行失败，请检查代码。"
      );
    } catch {
      setStatus("代码运行失败，请确认 FastAPI 服务正在运行。");
    } finally {
      setCodeRunning(false);
    }
  }

  function updateOption(index: number, patch: Partial<QuestionOption>) {
    applyQuestionChange((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, ...patch } : option
      )
    }));
  }

  function markSingleCorrect(index: number) {
    applyQuestionChange((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => ({
        ...option,
        is_correct: optionIndex === index
      }))
    }));
  }

  function addOption() {
    applyQuestionChange((current) => {
      const nextIndex = current.options.length + 1;
      const nextLabel =
        current.type === "fill_blank" ? `空${nextIndex}` : String.fromCharCode(64 + nextIndex);
      return {
        ...current,
        options: [
          ...current.options,
          {
            label: nextLabel,
            text: "",
            is_correct: current.type === "fill_blank",
            position: nextIndex
          }
        ]
      };
    });
  }

  async function removeOption(index: number) {
    const option = selectedQuestion.options[index];
    const confirmed = await confirmDelete({
      title: "删除选项",
      itemName: option?.text || option?.label || "选项",
      description: "该选项会从当前题目中移除。保存题目后生效。"
    });
    if (!confirmed) return;

    applyQuestionChange((current) => ({
      ...current,
      options: current.options.filter((_, optionIndex) => optionIndex !== index)
    }));
  }

  function addMedia(media_type: UploadMediaType, title: string, url: string) {
    applyQuestionChange((current) => ({
      ...current,
      media_assets: [
        ...current.media_assets,
        {
          media_type,
          title,
          url,
          position: current.media_assets.length + 1
        }
      ]
    }));
  }

  function updateMedia(index: number, patch: Partial<QuestionMedia>) {
    applyQuestionChange((current) => ({
      ...current,
      media_assets: current.media_assets.map((media, mediaIndex) =>
        mediaIndex === index ? { ...media, ...patch } : media
      )
    }));
  }

  async function removeMedia(index: number) {
    const media = selectedQuestion.media_assets[index];
    const confirmed = await confirmDelete({
      title: "删除素材",
      itemName: media?.title || "题干素材",
      description: "该图片、音频或视频素材会从当前题目中移除。保存题目后生效。"
    });
    if (!confirmed) return;

    applyQuestionChange((current) => ({
      ...current,
      media_assets: current.media_assets.filter((_, mediaIndex) => mediaIndex !== index)
    }));
  }

  function newQuestion(type = activeType) {
    if (!canEditQuestions) {
      setStatus("当前正在查看其他老师题目，不能新增题目。");
      return;
    }
    const nextType = canUseQuestionType(type, institutionCategory)
      ? type
      : defaultQuestionTypeForInstitution(institutionCategory);
    const next = createBlankQuestion(nextType, institutionCategory, currentUserId);
    setSelectedQuestion(next);
    setActiveType(nextType);
    setCodeRunResult(null);
    setStatus("已创建新题目草稿。");
  }

  function selectQuestion(question: AdminQuestion) {
    if (!canUseQuestionType(question.type, institutionCategory)) {
      setStatus(
        isRetiredQuestionType(question.type)
          ? "代码修改题已停用，不能继续编辑。"
          : "当前机构不是 IT 教育类，不能编辑代码编写题。"
      );
      return;
    }
    setSelectedQuestion(normalizeQuestion(question));
    setActiveType(question.type);
    setCodeRunResult(null);
  }

  async function persistQuestion(
    question: AdminQuestion,
    nextStatus: Exclude<QuestionStatusValue, "draft">
  ) {
    if (!canEditQuestions) {
      setStatus("当前正在查看其他老师题目，只能查看详情，不能保存。");
      return null;
    }
    if (question.created_by_user_id && question.created_by_user_id !== currentUserId) {
      setStatus("只能编辑和保存自己创建的题目。");
      return null;
    }
    const questionToSave = {
      ...question,
      created_by_user_id: question.created_by_user_id ?? currentUserId,
      difficulty:
        question.id === selectedQuestion.id
          ? normalizedSelectedDifficulty
          : difficultyOptions.includes(question.difficulty)
            ? question.difficulty
            : difficultyOptions[0],
      status: nextStatus
    };
    if (!canUseQuestionType(questionToSave.type, institutionCategory)) {
      setStatus(
        isRetiredQuestionType(questionToSave.type)
          ? "代码修改题已停用，不能保存。"
          : "当前机构不是 IT 教育类，不能保存代码编写题。"
      );
      return null;
    }
    const validationMessage = validateQuestionBeforeSave(questionToSave);
    if (validationMessage) {
      setStatus(validationMessage);
      return null;
    }
    const payload = buildQuestionPayload(questionToSave);
    try {
      const isExisting = isPersistedQuestion(question);
      const response = await fetch(
        `${API_BASE_URL}/admin/questions${isExisting ? `/${question.id}` : ""}`,
        {
          method: isExisting ? "PATCH" : "POST",
          headers: getAdminRequestHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) {
        setStatus(`保存失败：${await readApiErrorMessage(response)}`);
        return null;
      }
      const saved = normalizeQuestion((await response.json()) as AdminQuestion);
      setQuestions((current) => {
        const exists = current.some((item) => item.id === question.id || item.id === saved.id);
        return exists
          ? current.map((item) => (item.id === question.id || item.id === saved.id ? saved : item))
          : [saved, ...current];
      });
      if (selectedQuestion.id === question.id || selectedQuestion.id === saved.id) {
        setSelectedQuestion(saved);
      }
      setActiveType(saved.type);
      notifyQuestionBankChanged();
      setStatus("题目已保存到题库");
      return saved;
    } catch {
      const localSaved = {
        ...normalizeQuestion(questionToSave),
        id: question.id ?? createLocalDraftId(),
        status: nextStatus
      };
      setQuestions((current) => {
        const exists = current.some((question) => question.id === localSaved.id);
        return exists
          ? current.map((question) => (question.id === localSaved.id ? localSaved : question))
          : [localSaved, ...current];
      });
      if (selectedQuestion.id === question.id || selectedQuestion.id === localSaved.id) {
        setSelectedQuestion(localSaved);
      }
      setStatus("API 不可用，已保存到本地演示状态。");
      notifyQuestionBankChanged();
      return localSaved;
    }
  }

  async function saveQuestion() {
    setIsSaving(true);
    try {
      await persistQuestion(selectedQuestion, "saved");
    } finally {
      setIsSaving(false);
    }
  }

  async function publishQuestion(question: AdminQuestion) {
    if (!canEditQuestions || (question.created_by_user_id && question.created_by_user_id !== currentUserId)) {
      setStatus("只能发布自己创建的题目。");
      return;
    }
    setIsSaving(true);
    try {
      let publishTarget = question;
      if (!isPersistedQuestion(publishTarget) || publishTarget.status === "draft") {
        const saved = await persistQuestion(publishTarget, "saved");
        if (!saved) {
          return;
        }
        publishTarget = saved;
      }

      if (!isPersistedQuestion(publishTarget)) {
        const localPublished = { ...publishTarget, status: "published" as QuestionStatusValue };
        setQuestions((current) => upsertQuestionInList(current, localPublished));
        if (selectedQuestion.id === publishTarget.id) {
          setSelectedQuestion(localPublished);
        }
        setStatus("API 不可用，已在本地演示状态标记为已发布。");
        notifyQuestionBankChanged();
        return;
      }

      const response = await fetch(`${API_BASE_URL}/admin/questions/${publishTarget.id}/publish`, {
        method: "POST",
        headers: getAdminRequestHeaders()
      });
      if (!response.ok) {
        setStatus(`发布失败：${await readApiErrorMessage(response)}`);
        return;
      }
      const published = normalizeQuestion((await response.json()) as AdminQuestion);
      setQuestions((current) => upsertQuestionInList(current, published));
      if (selectedQuestion.id === publishTarget.id) {
        setSelectedQuestion(published);
      }
      notifyQuestionBankChanged();
      setStatus("题目已发布，学生端现在可以看到。");
    } catch {
      const localPublished = { ...question, status: "published" as QuestionStatusValue };
      setQuestions((current) => upsertQuestionInList(current, localPublished));
      if (selectedQuestion.id === question.id) {
        setSelectedQuestion(localPublished);
      }
      notifyQuestionBankChanged();
      setStatus("API 不可用，已在本地演示状态标记为已发布。");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteQuestion(question: AdminQuestion) {
    if (!question.id) {
      return;
    }
    if (!canEditQuestions || (question.created_by_user_id && question.created_by_user_id !== currentUserId)) {
      setStatus("只能删除自己创建的题目。");
      return;
    }
    const confirmed = await confirmDelete({
      title: "删除题目",
      itemName: question.content.title || question.prompt || "题库题目",
      description: "该题目会从题库中删除。已经使用该题目的课程可能需要重新检查练习或测验配置。"
    });
    if (!confirmed) return;

    if (isPersistedQuestion(question)) {
      try {
        await fetch(`${API_BASE_URL}/admin/questions/${question.id}`, {
          method: "DELETE",
          headers: getAdminRequestHeaders()
        });
        setStatus("题目已从数据库删除。");
      } catch {
        setStatus("API 不可用，已从本地演示列表删除。");
      }
    } else {
      setStatus("草稿已从列表删除。");
    }
    setQuestions((current) => current.filter((item) => item.id !== question.id));
    notifyQuestionBankChanged();
    if (selectedQuestion.id === question.id) {
      newQuestion(activeType);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[20rem_1fr]">
      {deleteConfirmDialog}
      <aside className="grid h-fit gap-4">
        <section className="panel rounded-lg p-4">
          <p className="text-sm font-bold text-ink">题型</p>
          <div className="mt-3 grid gap-2">
            {availableQuestionTypes.map((type) => (
              <button
                key={type.value}
                onClick={() => {
                  setActiveType(type.value);
                  if (canEditQuestions) {
                    newQuestion(type.value);
                  }
                }}
                className={`focus-ring rounded-lg px-3 py-2 text-left text-sm font-semibold ${
                  activeType === type.value ? "bg-ink text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </section>

        {showFormulaTools ? (
          <FormulaTemplateBar
            targetOptions={formulaTargetOptions}
            targetValue={normalizedFormulaInsertTarget}
            onTargetChange={setFormulaInsertTarget}
            onInsert={insertFormulaTemplateToTarget}
          />
        ) : null}

        <section className="panel rounded-lg p-4">
          <div className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">
          <p className="font-bold text-slate-700">当前机构类别：{institutionCategoryLabel}</p>
          <p className="mt-1 font-bold text-slate-700">
            当前查看：{ownerOptions.find((owner) => owner.id === effectiveOwnerId)?.name ?? "当前用户"}
          </p>
          <p className="mt-1">{status}</p>
          </div>
        </section>
      </aside>

      <section className="grid gap-5">
        <div className="panel rounded-lg p-5">
          <div className="grid gap-4 lg:grid-cols-[9rem_1fr_auto] lg:items-end">
            <div className="lg:self-center">
              <h2 className="text-xl font-bold text-ink">题库列表</h2>
              <p className="mt-1 text-sm text-slate-500">{activeTypeMeta.label} · {filteredQuestions.length} 道</p>
            </div>
            <div
              className={`grid gap-3 ${
                isSuperAdmin ? "sm:grid-cols-[14rem_minmax(18rem,26rem)]" : "sm:grid-cols-[minmax(18rem,26rem)]"
              }`}
            >
              {isSuperAdmin ? (
                <label className="grid gap-1 text-xs font-bold text-slate-600">
                  查看老师
                  <select
                    className="focus-ring h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-ink"
                    value={effectiveOwnerId || ""}
                    onChange={(event) => setSelectedOwnerId(Number(event.target.value))}
                  >
                    {ownerOptions.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.id === currentUserId ? `${owner.name}（自己）` : owner.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="grid gap-1 text-xs font-bold text-slate-600">
                关键词搜索
                <input
                  className="focus-ring h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-ink"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="搜索标题、题干、知识点、难度"
                />
              </label>
            </div>
            <button
              onClick={() => newQuestion(activeType)}
              disabled={!canEditQuestions}
              className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-coral px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 lg:self-end"
            >
              <Plus size={16} /> 新增题目
            </button>
          </div>
          <div className="mt-4 grid gap-3">
            {filteredQuestions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                {trimmedSearchTerm
                  ? `没有找到包含“${trimmedSearchTerm}”的题目`
                  : canEditQuestions
                    ? "当前题型还没有题目，点击“新增题目”开始创建。"
                    : "当前老师没有这个题型的题目。"}
              </div>
            ) : null}
            {filteredQuestions.map((question) => (
              <div
                key={question.id ?? question.prompt}
                className={`rounded-lg border bg-white p-4 ${
                  selectedQuestion.id === question.id ? "border-mint" : "border-slate-200"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button className="text-left" onClick={() => selectQuestion(question)}>
                    <p className="font-bold text-ink">{question.content.title || question.prompt || "未命名题目"}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {normalizeSkillArea(question.skill_area) || "综合能力"} · {question.difficulty} · {question.points} 分
                    </p>
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-skysoft/20 px-2.5 py-1 text-xs font-bold text-blue-700">
                      {questionTypeLabel(question.type)}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${questionStatusClasses[question.status]}`}
                    >
                      {questionStatusLabels[question.status]}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        question.is_public ? "bg-mint/15 text-mint" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {question.is_public ? "公开" : "机构内部"}
                    </span>
                    {question.requires_manual_grading ? (
                      <span className="rounded-full bg-coral/10 px-2.5 py-1 text-xs font-bold text-coral">人工批改</span>
                    ) : null}
                    <button
                      onClick={() => publishQuestion(question)}
                      disabled={
                        isSaving ||
                        question.status === "published" ||
                        !canEditQuestions ||
                        Boolean(question.created_by_user_id && question.created_by_user_id !== currentUserId)
                      }
                      className="focus-ring rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      发布
                    </button>
                    <button
                      onClick={() => selectQuestion(question)}
                      className="focus-ring grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600"
                      aria-label="编辑题目"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      onClick={() => { void deleteQuestion(question); }}
                      disabled={
                        !canEditQuestions ||
                        Boolean(question.created_by_user_id && question.created_by_user_id !== currentUserId)
                      }
                      className="focus-ring grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-coral"
                      aria-label="删除题目"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <section className="panel rounded-lg p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-ink">题目编辑器</h2>
              <p className="mt-1 text-sm text-slate-500">
                {canEditQuestions
                  ? "填写任何内容后会自动生成草稿，代码环境只出现在代码题中。"
                  : "当前为只读详情，不能编辑其他老师创建的题目。"}
              </p>
            </div>
            <button
              onClick={saveQuestion}
              disabled={isSaving || !canEditQuestions}
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              <Save size={16} /> {isSaving ? "保存中" : "保存题目"}
            </button>
          </div>

          <fieldset disabled={!canEditQuestions} className="disabled:opacity-75">
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              题目标题
              <input
                className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                value={selectedQuestion.content.title ?? ""}
                onChange={(event) => updateContent("title", event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              题型
              <select
                className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                value={selectedQuestion.type}
                onChange={(event) => {
                  const nextType = event.target.value as QuestionTypeValue;
                  setActiveType(nextType);
                  applyQuestionChange((current) => ({
                    ...current,
                    type: nextType,
                    requires_manual_grading: nextType === "writing",
                    options: createDefaultOptions(nextType),
                    difficulty: difficultyOptions.includes(current.difficulty)
                      ? current.difficulty
                      : difficultyOptions[0],
                    content: {
                      ...current.content,
                      starter_code: isCodeQuestion(nextType)
                        ? current.content.starter_code ??
                          "def solve(items):\n    # 在这里编写或修改代码\n    return items"
                        : undefined,
                      tests: isCodeQuestion(nextType) ? current.content.tests ?? [] : undefined
                    },
                    answer_key: isCodeQuestion(nextType)
                      ? {
                          ...current.answer_key,
                          reference_solution:
                            (current.answer_key.reference_solution as string | undefined) ?? "",
                          expected_output:
                            (current.answer_key.expected_output as string | undefined) ?? ""
                        }
                      : usesOptions(nextType)
                        ? {}
                        : current.answer_key
                  }));
                }}
              >
                {availableQuestionTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              难度
              <select
                className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                value={normalizedSelectedDifficulty}
                onChange={(event) => updateSelected({ difficulty: event.target.value })}
              >
                {difficultyOptions.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              知识点
              <input
                className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                value={selectedQuestion.skill_area}
                onChange={(event) => updateSelected({ skill_area: event.target.value })}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              分值
              <input
                className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                type="number"
                min={1}
                value={selectedQuestion.points}
                onChange={(event) => updateSelected({ points: Number(event.target.value) })}
              />
            </label>
            <label className="flex h-full min-h-20 items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
              <span>
                <span className="block text-ink">公开到前台题库</span>
                <span className="mt-1 block text-xs font-medium text-slate-500">
                  关闭后仅用于本机构练习、测验、模拟考或竞赛。
                </span>
              </span>
              <input
                type="checkbox"
                checked={selectedQuestion.is_public}
                onChange={(event) => updateSelected({ is_public: event.target.checked })}
                className="h-5 w-5 accent-mint"
              />
            </label>
            <ResourceTagPicker
              value={selectedQuestion.tagIds}
              onChange={(tagIds) => updateSelected({ tagIds })}
              disabled={!canEditQuestions}
              className="md:col-span-2"
            />
          </div>

          <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>题干</span>
              {showFormulaTools ? (
                <span className="text-xs font-bold text-slate-400">支持 $...$、$$...$$、\ce{"{...}"} 公式写法</span>
              ) : null}
            </div>
            <textarea
              ref={promptInputRef}
              className="focus-ring min-h-32 rounded-lg border border-slate-200 px-3 py-2 leading-7"
              value={selectedQuestion.prompt}
              onFocus={() => setFormulaInsertTarget("prompt")}
              onChange={(event) => updateSelected({ prompt: event.target.value })}
            />
            {showFormulaTools ? (
              <FormulaPreview title="题干预览" value={selectedQuestion.prompt} />
            ) : null}
          </div>

          <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-700">
            <span>题目提示</span>
            <textarea
              ref={hintInputRef}
              className="focus-ring min-h-24 rounded-lg border border-slate-200 px-3 py-2 leading-7"
              value={selectedQuestion.hint}
              onFocus={() => setFormulaInsertTarget("hint")}
              onChange={(event) => updateSelected({ hint: event.target.value })}
              placeholder="可为空。学生点击提示按钮后才会看到这里的内容。"
            />
            {showFormulaTools ? (
              <FormulaPreview title="提示预览" value={selectedQuestion.hint} />
            ) : null}
          </div>

          <MediaEditor
            mediaAssets={selectedQuestion.media_assets}
            addMedia={addMedia}
            updateMedia={updateMedia}
            removeMedia={removeMedia}
          />

          {usesOptions(selectedQuestion.type) ? (
            <OptionsEditor
              question={selectedQuestion}
              addOption={addOption}
              removeOption={removeOption}
              updateOption={updateOption}
              markSingleCorrect={markSingleCorrect}
              showFormulaTools={showFormulaTools}
              onOptionFocus={(index) => setFormulaInsertTarget(`option:${index}`)}
            />
          ) : null}

          {selectedQuestion.type === "writing" ? (
            <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-ink">开放式答案评分设置</h3>
                  <p className="mt-1 text-sm text-slate-500">开放式答案默认进入人工批改队列。</p>
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedQuestion.requires_manual_grading}
                    onChange={(event) =>
                      updateSelected({ requires_manual_grading: event.target.checked })
                    }
                    className="accent-coral"
                  />
                  需要人工批改
                </label>
              </div>
              <label className="mt-4 grid gap-2 text-sm font-semibold text-slate-700">
                评分标准
                <textarea
                  className="focus-ring min-h-24 rounded-lg border border-slate-200 px-3 py-2 leading-7"
                  value={(selectedQuestion.content.rubric as string | undefined) ?? ""}
                  onChange={(event) => updateContent("rubric", event.target.value)}
                />
              </label>
            </section>
          ) : null}

          {isCodeQuestion(selectedQuestion.type) ? (
            <section className="mt-5 rounded-lg border border-slate-200 bg-[#101827] p-4 text-sm text-slate-100">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 font-bold text-skysoft">
                  <Code2 size={16} /> 代码运行环境
                </span>
                <button
                  type="button"
                  onClick={() => void runSelectedQuestionCode()}
                  disabled={codeRunning || !canEditQuestions}
                  className="focus-ring rounded-lg bg-mint px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-500"
                >
                  {codeRunning ? "运行中..." : "运行代码"}
                </button>
              </div>
              <textarea
                className="focus-ring min-h-48 w-full resize-y rounded-lg border border-slate-700 bg-[#0b1220] p-3 font-mono text-sm leading-6 text-slate-100"
                value={selectedQuestion.content.starter_code ?? ""}
                onChange={(event) => updateContent("starter_code", event.target.value)}
              />
              <label className="mt-3 grid gap-2 text-sm font-semibold text-slate-200">
                测试用例
                <textarea
                  className="focus-ring min-h-20 rounded-lg border border-slate-700 bg-[#0b1220] p-3 font-mono text-sm leading-6 text-slate-100"
                  value={(selectedQuestion.content.tests ?? []).join("\n")}
                  onChange={(event) => updateContent("tests", event.target.value.split("\n").filter(Boolean))}
                />
              </label>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-slate-200">
                  正确答案 / 参考实现
                  <textarea
                    className="focus-ring min-h-32 rounded-lg border border-slate-700 bg-[#0b1220] p-3 font-mono text-sm leading-6 text-slate-100"
                    value={(selectedQuestion.answer_key.reference_solution as string | undefined) ?? ""}
                    onChange={(event) => updateAnswerKey("reference_solution", event.target.value)}
                    placeholder="写入标准解法或关键实现，用于自动或人工判题参考"
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-200">
                  期望输出 / 判题说明
                  <textarea
                    className="focus-ring min-h-32 rounded-lg border border-slate-700 bg-[#0b1220] p-3 font-mono text-sm leading-6 text-slate-100"
                    value={(selectedQuestion.answer_key.expected_output as string | undefined) ?? ""}
                    onChange={(event) => updateAnswerKey("expected_output", event.target.value)}
                    placeholder="例如：返回最大值；所有测试用例通过"
                  />
                </label>
              </div>
              {codeRunResult ? <AdminCodeRunResultPanel result={codeRunResult} /> : null}
            </section>
          ) : null}
          </fieldset>
        </section>
      </section>
    </div>
  );
}

function FormulaTemplateBar({
  targetOptions,
  targetValue,
  onTargetChange,
  onInsert
}: {
  targetOptions: Array<{ value: string; label: string }>;
  targetValue: string;
  onTargetChange: (target: string) => void;
  onInsert: (template: string) => void;
}) {
  return (
    <section className="panel rounded-lg p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-ink">公式与理化符号</h3>
          <p className="mt-1 text-sm text-slate-500">选择插入位置后，点击模板即可写入对应编辑区。</p>
        </div>
        <label className="grid min-w-52 gap-1.5 text-xs font-black text-slate-500">
          插入到
          <select
            className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
            value={targetValue}
            onChange={(event) => onTargetChange(event.target.value)}
          >
            {targetOptions.map((target) => (
              <option key={target.value} value={target.value}>
                {target.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-2">
        {formulaTemplateGroups.map((group) => (
          <div key={group.title} className="grid gap-2 sm:grid-cols-[4.5rem_1fr] sm:items-start">
            <span className="inline-flex items-center gap-1 pt-1.5 text-xs font-black text-slate-500">
              <group.icon size={14} />
              {group.title}
            </span>
            <div className="flex min-w-0 flex-wrap gap-2">
              {group.templates.map((template) => (
                <button
                  key={`${group.title}-${template.label}`}
                  type="button"
                  onClick={() => onInsert(template.value)}
                  className="focus-ring rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-mint/50 hover:text-mint"
                >
                  {template.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AdminCodeRunResultPanel({ result }: { result: CodeRunResult }) {
  return (
    <div className="mt-4 rounded-lg border border-slate-700 bg-[#0b1220] p-3 text-xs text-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 font-bold ${result.passed ? "text-mint" : "text-coral"}`}>
          {result.passed ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {result.passed ? "测试通过" : "测试未通过"}
        </span>
        <span className="text-slate-400">{result.duration_ms}ms</span>
      </div>
      {result.error ? <pre className="mt-2 whitespace-pre-wrap rounded bg-coral/10 p-2 font-mono text-coral">{result.error}</pre> : null}
      {result.stdout ? (
        <div className="mt-2">
          <p className="mb-1 font-bold text-slate-400">stdout</p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 font-mono">{result.stdout}</pre>
        </div>
      ) : null}
      {result.stderr ? (
        <div className="mt-2">
          <p className="mb-1 font-bold text-slate-400">stderr</p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-coral/10 p-2 font-mono text-coral">{result.stderr}</pre>
        </div>
      ) : null}
      {result.tests.length ? (
        <div className="mt-2 grid gap-1.5">
          {result.tests.map((test, index) => (
            <div key={`${test.test}-${index}`} className="rounded border border-white/10 bg-white/5 p-2">
              <p className={`font-bold ${test.passed ? "text-mint" : "text-coral"}`}>
                {test.passed ? "通过" : "未通过"} · {test.test}
              </p>
              {test.message ? <p className="mt-1 text-slate-300">{test.message}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FormulaPreview({ title, value }: { title: string; value: string }) {
  if (!value.trim()) {
    return null;
  }
  return (
    <div className="rounded-lg border border-mint/20 bg-mint/5 p-3">
      <p className="mb-2 text-xs font-black text-mint">{title}</p>
      <MathText className="block whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">
        {value}
      </MathText>
    </div>
  );
}

function OptionsEditor({
  question,
  addOption,
  removeOption,
  updateOption,
  markSingleCorrect,
  showFormulaTools,
  onOptionFocus
}: {
  question: AdminQuestion;
  addOption: () => void;
  removeOption: (index: number) => void | Promise<void>;
  updateOption: (index: number, patch: Partial<QuestionOption>) => void;
  markSingleCorrect: (index: number) => void;
  showFormulaTools: boolean;
  onOptionFocus: (index: number) => void;
}) {
  const isFillBlank = question.type === "fill_blank";
  const isSingleChoice = question.type === "single_choice";

  return (
    <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-ink">{isFillBlank ? "填空答案设置" : "题目选项设置"}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {isFillBlank
              ? "可为同一个空添加多个可接受答案。"
              : showFormulaTools
                ? "单选题选择一个正确项，多选题可以选择多个正确项。选项内容同样支持公式和理化符号。"
                : "单选题选择一个正确项，多选题可以选择多个正确项。"}
          </p>
        </div>
        <button
          onClick={addOption}
          className="focus-ring inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
        >
          <Plus size={15} /> {isFillBlank ? "新增答案" : "新增选项"}
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        {question.options.map((option, index) => (
          <div
            key={`${option.label}-${index}`}
            className={`grid gap-3 rounded-lg bg-slate-50 p-3 ${
              isFillBlank ? "lg:grid-cols-[8rem_1fr_2.5rem]" : "lg:grid-cols-[8rem_1fr_8rem_2.5rem]"
            }`}
          >
            {isFillBlank ? (
              <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600">
                {`空${index + 1}`}
              </div>
            ) : (
              <input
                className="focus-ring rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={option.label}
                onChange={(event) => updateOption(index, { label: event.target.value })}
                placeholder="A"
              />
            )}
            <div className="grid gap-2">
              <input
                className="focus-ring rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={option.text}
                onFocus={() => {
                  if (showFormulaTools && !isFillBlank) {
                    onOptionFocus(index);
                  }
                }}
                onChange={(event) => updateOption(index, { text: event.target.value })}
                placeholder={isFillBlank ? "标准答案或可接受答案" : "选项内容"}
              />
              {hasMathText(option.text) ? (
                <div className="rounded-lg border border-mint/20 bg-white px-3 py-2 text-xs font-semibold leading-6 text-slate-700">
                  <MathText>{option.text}</MathText>
                </div>
              ) : null}
            </div>
            {!isFillBlank ? (
              <label className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                <input
                  type={isSingleChoice ? "radio" : "checkbox"}
                  name={isSingleChoice ? "single-correct-option" : undefined}
                  checked={option.is_correct}
                  onChange={(event) =>
                    isSingleChoice
                      ? markSingleCorrect(index)
                      : updateOption(index, { is_correct: event.target.checked })
                  }
                  className="accent-coral"
                />
                正确
              </label>
            ) : null}
            <button
              onClick={() => { void removeOption(index); }}
              className="focus-ring grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-coral"
              aria-label="删除选项"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function LocalUploadProgressRing({ progress }: { progress: number }) {
  const size = 18;
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const value = Math.max(0, Math.min(100, Math.round(progress)));
  const offset = circumference - (value / 100) * circumference;

  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold tabular-nums text-mint" aria-label={`上传进度 ${value}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle cx="9" cy="9" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="3" />
        <circle
          cx="9"
          cy="9"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 9 9)"
        />
      </svg>
      <span>{value}%</span>
    </span>
  );
}

function MediaEditor({
  mediaAssets,
  addMedia,
  updateMedia,
  removeMedia
}: {
  mediaAssets: QuestionMedia[];
  addMedia: (type: UploadMediaType, title: string, url: string) => void;
  updateMedia: (index: number, patch: Partial<QuestionMedia>) => void;
  removeMedia: (index: number) => void | Promise<void>;
}) {
  const [uploadError, setUploadError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{ target: string; percent: number } | null>(null);

  function readMediaFile(
    target: string,
    type: UploadMediaType,
    file: File | undefined,
    onLoaded: (file: File, dataUrl: string) => void
  ) {
    if (!file) {
      return;
    }
    if (file.size > MAX_STEM_MEDIA_UPLOAD_BYTES) {
      setUploadError("单个素材请控制在 5MB 以内。");
      return;
    }
    const option = uploadMediaOptions.find((item) => item.type === type);
    const expectedPrefix = `${type}/`;
    if (!file.type.startsWith(expectedPrefix)) {
      setUploadError(`请上传${option?.label ?? "素材"}文件。`);
      return;
    }
    const reader = new FileReader();
    setUploadProgress({ target, percent: 1 });
    reader.onprogress = (event) => {
      const percent = event.lengthComputable
        ? Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100)))
        : 1;
      setUploadProgress({ target, percent });
    };
    reader.onerror = () => {
      setUploadError("文件读取失败，请重新选择。");
      setUploadProgress(null);
    };
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) {
        setUploadError("文件读取失败，请重新选择。");
        setUploadProgress(null);
        return;
      }
      setUploadProgress({ target, percent: 100 });
      onLoaded(file, dataUrl);
      setUploadError("");
      window.setTimeout(() => setUploadProgress(null), 250);
    };
    reader.readAsDataURL(file);
  }

  function handleFileUpload(type: UploadMediaType, file: File | undefined) {
    readMediaFile(type, type, file, (loadedFile, dataUrl) => {
      addMedia(type, loadedFile.name, dataUrl);
    });
  }

  return (
    <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-ink">题干素材</h3>
          <p className="mt-1 text-sm text-slate-500">题干可以上传图片、音频或视频素材。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {uploadMediaOptions.map((item) => {
            const isUploading = uploadProgress?.target === item.type;
            return (
              <label
                key={item.type}
                className="focus-ring inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
              >
                {isUploading ? <LocalUploadProgressRing progress={uploadProgress.percent} /> : <item.icon size={15} />} 上传{item.label}
                <input
                  type="file"
                  accept={item.accept}
                  className="sr-only"
                  disabled={isUploading}
                  onChange={(event) => {
                    handleFileUpload(item.type, event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            );
          })}
        </div>
      </div>
      {uploadError ? (
        <p className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-sm font-semibold text-coral">
          {uploadError}
        </p>
      ) : null}

      {mediaAssets.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {mediaAssets.map((media, index) => {
            const replaceTarget = `replace-${index}`;
            const replacing = uploadProgress?.target === replaceTarget;
            return (
              <div key={`${media.media_type}-${index}`} className="grid gap-3 rounded-lg bg-slate-50 p-3 lg:grid-cols-[10rem_1fr_9rem_2.5rem]">
                <MediaPreview media={media} />
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  素材名称
                  <input
                    className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={media.title}
                    onChange={(event) => updateMedia(index, { title: event.target.value })}
                    placeholder="素材名称"
                  />
                </label>
                <label className="grid content-center gap-2 text-sm font-semibold text-slate-700">
                  替换文件
                  <span className="flex items-center gap-2">
                    <input
                      className="block w-full text-xs text-slate-500 file:mr-2 file:rounded-md file:border-0 file:bg-white file:px-2 file:py-1.5 file:text-xs file:font-bold file:text-slate-700"
                      type="file"
                      accept={uploadMediaOptions.find((item) => item.type === media.media_type)?.accept}
                      disabled={replacing}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (media.media_type !== "handout") {
                          readMediaFile(replaceTarget, media.media_type, file, (loadedFile, dataUrl) => {
                            updateMedia(index, { title: loadedFile.name, url: dataUrl });
                          });
                        }
                        event.currentTarget.value = "";
                      }}
                    />
                    {replacing ? <LocalUploadProgressRing progress={uploadProgress.percent} /> : null}
                  </span>
                </label>
                <button
                  onClick={() => { void removeMedia(index); }}
                  className="focus-ring grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-coral"
                  aria-label="删除素材"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
function MediaPreview({ media }: { media: QuestionMedia }) {
  const label = mediaTypeLabel(media.media_type);
  const hasSource = media.url.trim().length > 0;
  if (!hasSource) {
    return (
      <div className="grid h-24 place-items-center rounded-lg border border-dashed border-slate-300 bg-white px-3 text-center text-xs font-bold text-slate-500">
        {label}待上传文件
      </div>
    );
  }
  if (media.media_type === "image") {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <img src={media.url} alt={media.title || label} className="h-24 w-full object-contain p-2" />
      </div>
    );
  }
  if (media.media_type === "audio") {
    return (
      <div className="grid h-24 content-center rounded-lg border border-slate-200 bg-white p-2">
        <p className="mb-2 text-xs font-bold text-slate-500">{label}</p>
        <audio controls src={media.url} className="w-full" />
      </div>
    );
  }
  if (media.media_type === "video") {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <video controls src={media.url} className="h-24 w-full bg-black object-contain" />
      </div>
    );
  }
  return (
    <div className="grid h-24 place-items-center rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-500">
      {label}
    </div>
  );
}

function preparedOptions(question: AdminQuestion) {
  return question.options
    .map((option, index) => ({
      label:
        option.label.trim() ||
        (question.type === "fill_blank" ? `空${index + 1}` : String.fromCharCode(65 + index)),
      text: option.text.trim(),
      is_correct: question.type === "fill_blank" ? true : option.is_correct,
      explanation: option.explanation?.trim() || null,
      position: index + 1
    }))
    .filter((option) => option.text.length > 0);
}

function validateQuestionBeforeSave(question: AdminQuestion) {
  const options = preparedOptions(question);
  if (question.type === "fill_blank" && options.length === 0) {
    return "请至少填写一个填空题可接受答案。";
  }
  if (question.type === "single_choice") {
    if (options.length < 2) {
      return "请至少填写两个单选题选项内容。";
    }
    if (!options.some((option) => option.is_correct)) {
      return "请为单选题设置一个正确答案。";
    }
  }
  if (question.type === "multiple_choice") {
    if (options.length < 2) {
      return "请至少填写两个多选题选项内容。";
    }
    if (!options.some((option) => option.is_correct)) {
      return "请为多选题至少勾选一个正确答案。";
    }
  }
  return "";
}

async function readApiErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { detail?: unknown };
    if (Array.isArray(data.detail)) {
      return data.detail
        .map((item) => {
          if (typeof item === "object" && item && "msg" in item) {
            const message = String((item as { msg: unknown }).msg);
            const location = "loc" in item ? (item as { loc?: unknown[] }).loc?.join(".") : "";
            return location ? `${location}: ${message}` : message;
          }
          return String(item);
        })
        .join("；");
    }
    if (typeof data.detail === "string") {
      return data.detail;
    }
  } catch {
    // Fall through to the generic message below.
  }
  return `API 返回 ${response.status}`;
}

function buildQuestionPayload(question: AdminQuestion) {
  const options = preparedOptions(question);

  const answer_key: Record<string, unknown> = { ...question.answer_key };
  if (question.type === "fill_blank") {
    answer_key.answers = options.map((option) => option.text).filter(Boolean);
  }
  if (question.type === "single_choice") {
    answer_key.answer = options.find((option) => option.is_correct)?.label ?? "";
  }
  if (question.type === "multiple_choice") {
    answer_key.answers = options.filter((option) => option.is_correct).map((option) => option.label);
  }
  if (isCodeQuestion(question.type)) {
    answer_key.tests = question.content.tests ?? [];
  }

  return {
    institution_id: question.institution_id,
    course_id: null,
    type: question.type,
    prompt: question.prompt,
    hint: question.hint.trim(),
    content: question.content,
    answer_key,
    skill_area: normalizeSkillArea(question.skill_area),
    difficulty: question.difficulty || "A2",
    points: Number(question.points) || 10,
    requires_manual_grading: question.requires_manual_grading,
    is_public: question.is_public,
    status: question.status,
    tag_ids: question.tagIds,
    options,
    media_assets: question.media_assets
      .filter((media) => media.media_type !== "handout" && media.url.trim().length > 0)
      .map((media, index) => ({
      media_type: media.media_type,
      title: media.title,
      url: media.url,
      position: index + 1
    }))
  };
}

function mediaTypeLabel(type: QuestionMedia["media_type"]) {
  return { image: "图片", audio: "音频", video: "视频", handout: "讲义" }[type];
}

