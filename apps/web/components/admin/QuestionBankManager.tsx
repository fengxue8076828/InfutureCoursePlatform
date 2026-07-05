"use client";

import {
  Code2,
  Edit3,
  FileAudio,
  FileImage,
  FileVideo,
  Plus,
  Save,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDeleteConfirmation } from "./DeleteConfirmDialog";

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
  status: QuestionStatusValue;
  options: QuestionOption[];
  media_assets: QuestionMedia[];
};

type QuestionOwnerOption = {
  id: number;
  name: string;
  role: string;
};

type ApiManagedUser = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";
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
  { value: "coding", label: "代码编写题", needsOptions: false, needsCode: true },
  { value: "code_review", label: "代码修改题", needsOptions: false, needsCode: true }
];

function questionTypeLabel(type: QuestionTypeValue) {
  return questionTypes.find((item) => item.value === type)?.label ?? type;
}

function isCodeQuestion(type: QuestionTypeValue) {
  return type === "coding" || type === "code_review";
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
  return institutionCategory === "it" || !isCodeQuestion(type);
}

function defaultQuestionTypeForInstitution(institutionCategory: string): QuestionTypeValue {
  return questionTypes.find((type) => canUseQuestionType(type.value, institutionCategory))?.value ?? "fill_blank";
}

function usesOptions(type: QuestionTypeValue) {
  return type === "fill_blank" || type === "single_choice" || type === "multiple_choice";
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
    status: "draft",
    options: createDefaultOptions(type),
    media_assets: []
  };
}

function normalizeQuestion(raw: AdminQuestion): AdminQuestion {
  return {
    ...raw,
    type: raw.type,
    course_id: raw.course_id ?? null,
    created_by_user_id: raw.created_by_user_id ?? null,
    hint: raw.hint ?? "",
    content: raw.content ?? {},
    answer_key: raw.answer_key ?? {},
    status: raw.status ?? "saved",
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
  const currentUserId = currentUser?.id ?? 0;
  const { confirmDelete, deleteConfirmDialog } = useDeleteConfirmation();
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
        return [title, question.prompt, question.hint, question.skill_area, question.difficulty]
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
    setStatus("已创建新题目草稿。");
  }

  function selectQuestion(question: AdminQuestion) {
    if (!canUseQuestionType(question.type, institutionCategory)) {
      setStatus("当前机构不是 IT 教育类，不能编辑代码编写题或代码修改题。");
      return;
    }
    setSelectedQuestion(normalizeQuestion(question));
    setActiveType(question.type);
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
      setStatus("当前机构不是 IT 教育类，不能保存代码编写题或代码修改题。");
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
    <div className="grid gap-5 xl:grid-cols-[18rem_1fr]">
      {deleteConfirmDialog}
      <aside className="panel h-fit rounded-lg p-4">
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
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">
          <p className="font-bold text-slate-700">当前机构类别：{institutionCategoryLabel}</p>
          <p className="mt-1 font-bold text-slate-700">
            当前查看：{ownerOptions.find((owner) => owner.id === effectiveOwnerId)?.name ?? "当前用户"}
          </p>
          <p className="mt-1">{status}</p>
        </div>
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
                      {question.skill_area || "综合能力"} · {question.difficulty} · {question.points} 分
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
          </div>

          <label className="mt-4 grid gap-2 text-sm font-semibold text-slate-700">
            题干
            <textarea
              className="focus-ring min-h-32 rounded-lg border border-slate-200 px-3 py-2 leading-7"
              value={selectedQuestion.prompt}
              onChange={(event) => updateSelected({ prompt: event.target.value })}
            />
          </label>

          <label className="mt-4 grid gap-2 text-sm font-semibold text-slate-700">
            题目提示
            <textarea
              className="focus-ring min-h-24 rounded-lg border border-slate-200 px-3 py-2 leading-7"
              value={selectedQuestion.hint}
              onChange={(event) => updateSelected({ hint: event.target.value })}
              placeholder="可为空。学生点击提示按钮后才会看到这里的内容。"
            />
          </label>

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
                <button className="focus-ring rounded-lg bg-mint px-3 py-1.5 text-xs font-bold text-white">
                  运行代码
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
            </section>
          ) : null}
          </fieldset>
        </section>
      </section>
    </div>
  );
}

function OptionsEditor({
  question,
  addOption,
  removeOption,
  updateOption,
  markSingleCorrect
}: {
  question: AdminQuestion;
  addOption: () => void;
  removeOption: (index: number) => void | Promise<void>;
  updateOption: (index: number, patch: Partial<QuestionOption>) => void;
  markSingleCorrect: (index: number) => void;
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
            <input
              className="focus-ring rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={option.text}
              onChange={(event) => updateOption(index, { text: event.target.value })}
              placeholder={isFillBlank ? "标准答案或可接受答案" : "选项内容"}
            />
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

  function handleFileUpload(type: UploadMediaType, file: File | undefined) {
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
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) {
        setUploadError("文件读取失败，请重新选择。");
        return;
      }
      addMedia(type, file.name, dataUrl);
      setUploadError("");
    };
    reader.readAsDataURL(file);
  }

  return (
    <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-ink">题干素材</h3>
          <p className="mt-1 text-sm text-slate-500">题干可以上传图片、音频或视频素材。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {uploadMediaOptions.map((item) => (
            <label
              key={item.type}
              className="focus-ring inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
            >
              <item.icon size={15} /> 上传{item.label}
              <input
                type="file"
                accept={item.accept}
                className="sr-only"
                onChange={(event) => handleFileUpload(item.type, event.target.files?.[0])}
              />
            </label>
          ))}
        </div>
      </div>
      {uploadError ? (
        <p className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-sm font-semibold text-coral">
          {uploadError}
        </p>
      ) : null}

      {mediaAssets.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {mediaAssets.map((media, index) => (
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
                <input
                  className="block w-full text-xs text-slate-500 file:mr-2 file:rounded-md file:border-0 file:bg-white file:px-2 file:py-1.5 file:text-xs file:font-bold file:text-slate-700"
                  type="file"
                  accept={uploadMediaOptions.find((item) => item.type === media.media_type)?.accept}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file || media.media_type === "handout") {
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      const dataUrl = typeof reader.result === "string" ? reader.result : "";
                      if (dataUrl) {
                        updateMedia(index, { title: file.name, url: dataUrl });
                      }
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              <button
                onClick={() => { void removeMedia(index); }}
                className="focus-ring grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-coral"
                aria-label="删除素材"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
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
    skill_area: question.skill_area || "缁煎悎鑳藉姏",
    difficulty: question.difficulty || "A2",
    points: Number(question.points) || 10,
    requires_manual_grading: question.requires_manual_grading,
    status: question.status,
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

