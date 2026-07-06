import {
  BookMarked,
  Building2,
  ChevronDown,
  Database,
  FileQuestion,
  FileText,
  Filter,
  Image as ImageIcon,
  Lightbulb,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trophy
} from "lucide-react";
import Link from "next/link";

import { AddToQuestionBankButton } from "@/components/AddToQuestionBankButton";
import { getInstitutions, getPublishedQuestions } from "@/lib/api";
import type { Question, QuestionType } from "@/lib/types";

const questionTypeLabels: Record<QuestionType, string> = {
  single_choice: "\u5355\u9009\u9898",
  multiple_choice: "\u591a\u9009\u9898",
  fill_blank: "\u586b\u7a7a\u9898",
  coding: "\u4ee3\u7801\u7f16\u5199\u9898",
  code_review: "\u4ee3\u7801\u4fee\u6539\u9898",
  true_false: "\u5224\u65ad\u9898",
  reading: "\u9605\u8bfb\u7406\u89e3\u9898",
  listening: "\u542c\u529b\u9898",
  pronunciation: "\u53d1\u97f3\u53e3\u8bed\u9898",
  writing: "\u5199\u4f5c\u9898",
  media_upload: "\u56fe\u7247/\u89c6\u9891\u4e0a\u4f20\u9898"
};

const institutionCategoryLabels: Record<string, string> = {
  language: "\u8bed\u8a00\u6559\u80b2\u7c7b",
  it: "IT\u6559\u80b2\u7c7b",
  tutoring: "\u8bfe\u5916\u8865\u4e60\u7c7b",
  art: "\u827a\u672f\u6559\u80b2\u7c7b",
  other: "\u5176\u4ed6\u7c7b"
};

const promoCards = [
  {
    title: "\u9898\u5e93\u7ec3\u4e60\u4e2d\u5fc3",
    subtitle: "\u6309\u673a\u6784\u7c7b\u522b\u627e\u5230\u9002\u5408\u7684\u9898\u76ee",
    className: "from-[#1e2433] via-[#26365f] to-[#7357e8]"
  },
  {
    title: "\u8bed\u8a00\u80fd\u529b\u63d0\u5347",
    subtitle: "\u9605\u8bfb\u3001\u5199\u4f5c\u3001\u8bed\u6cd5\u548c\u542c\u529b\u5206\u7c7b\u8bad\u7ec3",
    className: "from-[#265b46] via-[#2f7a5e] to-[#88c9a9]"
  },
  {
    title: "IT \u4e13\u9879\u7ec3\u4e60",
    subtitle: "\u4ee3\u7801\u7f16\u5199\u3001\u4fee\u6539\u548c\u7b97\u6cd5\u601d\u7ef4",
    className: "from-[#5d5ef5] via-[#8057f2] to-[#bb69ff]"
  },
  {
    title: "Top Questions",
    subtitle: "\u4eca\u65e5\u70ed\u95e8\u9ad8\u5206\u9898\u76ee",
    className: "from-[#3065f4] via-[#3e76f6] to-[#72a6ff]"
  }
];

type FilterState = {
  q: string;
  category: string;
  type: string;
  level: string;
};

function normalize(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function questionTitle(question: Question) {
  return question.prompt?.trim() || `Question ${question.id}`;
}

function questionInstitutionName(question: Question, institutionsById?: Map<number, { name: string }>) {
  const institutionFromList = question.institution_id ? institutionsById?.get(question.institution_id) : undefined;
  return question.institution?.name || institutionFromList?.name || "\u5e73\u53f0\u9898\u5e93";
}

const categoryHints: Record<string, string[]> = {
  language: ["A1", "A2", "B1", "B2", "C1", "C2", "\u8bed\u8a00", "\u4e2d\u6587", "\u82f1\u8bed", "\u82f1\u6587", "\u9605\u8bfb", "\u5199\u4f5c", "\u542c\u529b", "\u53e3\u8bed", "\u8bed\u6cd5"],
  it: ["IT", "Python", "JavaScript", "\u7f16\u7a0b", "\u4ee3\u7801", "\u7b97\u6cd5", "STEM"],
  tutoring: ["\u6570\u5b66", "\u7269\u7406", "\u5316\u5b66", "\u8865\u4e60", "\u8003\u8bd5", "\u5e74\u7ea7"],
  art: ["\u827a\u672f", "\u97f3\u4e50", "\u7ed8\u753b", "\u8bbe\u8ba1", "\u7f8e\u672f"]
};

function inferCategoryFromQuestion(question: Question) {
  const haystack = `${question.prompt} ${question.skill_area} ${question.difficulty} ${question.type}`.toLowerCase();
  if (question.type === "coding" || question.type === "code_review") {
    return "it";
  }
  return Object.entries(categoryHints).find(([, hints]) =>
    hints.some((hint) => haystack.includes(hint.toLowerCase()))
  )?.[0];
}

function questionInstitutionCategory(
  question: Question,
  institutionsById: Map<number, { category: string }>
) {
  const categoryFromList = question.institution_id ? institutionsById.get(question.institution_id)?.category : undefined;
  return question.institution?.category || categoryFromList || inferCategoryFromQuestion(question) || "other";
}

function buildHref(current: FilterState, overrides: Partial<FilterState>) {
  const next = { ...current, ...overrides };
  const params = new URLSearchParams();
  Object.entries(next).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });
  const query = params.toString();
  return query ? `/question-bank?${query}` : "/question-bank";
}

function difficultyClass(level: string) {
  if (["\u7b80\u5355", "A1", "A2", "1\u7ea7", "1\u5e74\u7ea7", "2\u5e74\u7ea7"].includes(level)) {
    return "text-emerald-600 bg-emerald-50";
  }
  if (["\u590d\u6742", "\u6781\u590d\u6742", "C1", "C2"].includes(level)) {
    return "text-rose-600 bg-rose-50";
  }
  return "text-amber-600 bg-amber-50";
}

function QuestionRow({
  question,
  index,
  institutionsById
}: {
  question: Question;
  index: number;
  institutionsById: Map<number, { name: string; category: string }>;
}) {
  const title = questionTitle(question);
  const typeLabel = questionTypeLabels[question.type] ?? question.type;
  const institutionName = questionInstitutionName(question, institutionsById);

  return (
    <details className="group rounded-lg bg-white shadow-sm ring-1 ring-slate-100 transition open:ring-mint/40 hover:bg-slate-50/70">
      <summary className="grid cursor-pointer list-none grid-cols-[auto_1fr] gap-3 px-4 py-4 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-xs font-black text-slate-500">
            {index + 1}
          </span>
          <ChevronDown size={17} className="text-slate-400 transition group-open:rotate-180" />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{typeLabel}</span>
            <span className="rounded-full bg-mint/10 px-2 py-0.5 text-xs font-bold text-mint">{question.skill_area || "\u7efc\u5408\u80fd\u529b"}</span>
          </div>
          <h3 className="mt-2 truncate text-base font-black text-ink md:text-lg">{title}</h3>
        </div>

        <div className="col-span-2 flex flex-wrap items-center justify-start gap-2 md:col-span-1 md:justify-end">
          <span className={`rounded-full px-3 py-1 text-xs font-black ${difficultyClass(question.difficulty)}`}>
            {question.difficulty || "\u672a\u5206\u7ea7"}
          </span>
          <span className="inline-flex max-w-44 items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            <Building2 size={13} />
            <span className="truncate">{institutionName}</span>
          </span>
          <AddToQuestionBankButton questionId={question.id} title={title} />
        </div>
      </summary>

      <div className="border-t border-slate-100 px-4 pb-5 pt-4 md:ml-14">
        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <div>
            <p className="text-sm font-bold text-slate-500">{"\u9898\u76ee\u8be6\u60c5"}</p>
            <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
              {title}
            </div>

            {question.options?.length ? (
              <div className="mt-4 grid gap-2">
                {question.options.map((option) => (
                  <div key={option.id} className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm text-slate-700">
                    <span className="font-black text-ink">{option.label}. </span>
                    {option.text}
                  </div>
                ))}
              </div>
            ) : null}

            {question.hint ? (
              <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm leading-7 text-amber-800">
                <div className="mb-1 flex items-center gap-2 font-black">
                  <Lightbulb size={16} /> {"\u9898\u76ee\u63d0\u793a"}
                </div>
                {question.hint}
              </div>
            ) : null}
          </div>

          <aside className="rounded-lg border border-slate-100 bg-white p-4">
            <p className="text-sm font-black text-ink">{"\u9898\u76ee\u4fe1\u606f"}</p>
            <dl className="mt-3 grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">{"\u9898\u578b"}</dt>
                <dd className="font-bold text-ink">{typeLabel}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">{"\u7ea7\u522b"}</dt>
                <dd className="font-bold text-ink">{question.difficulty}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">{"\u673a\u6784"}</dt>
                <dd className="text-right font-bold text-ink">{institutionName}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">{"\u5206\u503c"}</dt>
                <dd className="font-bold text-ink">{question.points}</dd>
              </div>
            </dl>

            {question.media_assets?.length ? (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="flex items-center gap-2 text-sm font-black text-ink">
                  <ImageIcon size={15} /> {"\u9898\u5e72\u7d20\u6750"}
                </p>
                <div className="mt-2 grid gap-2">
                  {question.media_assets.map((asset) => (
                    <a key={asset.id} href={asset.url} className="truncate rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 hover:text-coral">
                      {asset.title}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </details>
  );
}

export default async function QuestionBankPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const filterState: FilterState = {
    q: normalize(params.q).trim(),
    category: normalize(params.category),
    type: normalize(params.type),
    level: normalize(params.level)
  };

  const [questions, institutions] = await Promise.all([getPublishedQuestions(), getInstitutions()]);
  const institutionsById = new Map(institutions.map((institution) => [institution.id, institution]));

  const allCategories = Array.from(
    new Set([...Object.keys(institutionCategoryLabels), ...institutions.map((institution) => institution.category).filter(Boolean)])
  );
  const types = Array.from(new Set(questions.map((question) => question.type))).filter(Boolean);
  const levels = Array.from(new Set(questions.map((question) => question.difficulty).filter(Boolean))).sort();

  const categoryTabs = allCategories.map((category) => ({
    category,
    label: institutionCategoryLabels[category] ?? category,
    count: questions.filter((question) => questionInstitutionCategory(question, institutionsById) === category).length
  }));

  const filteredQuestions = questions.filter((question) => {
    const keywordHaystack = `${question.prompt} ${question.skill_area} ${question.difficulty} ${questionTypeLabels[question.type] ?? question.type} ${questionInstitutionName(question, institutionsById)}`.toLowerCase();
    const keywordMatched = !filterState.q || keywordHaystack.includes(filterState.q.toLowerCase());
    const categoryMatched = !filterState.category || questionInstitutionCategory(question, institutionsById) === filterState.category;
    const typeMatched = !filterState.type || question.type === filterState.type;
    const levelMatched = !filterState.level || question.difficulty === filterState.level;
    return keywordMatched && categoryMatched && typeMatched && levelMatched;
  });

  const hotQuestions = [...questions]
    .sort((a, b) => (b.points || 0) - (a.points || 0) || (b.options?.length || 0) - (a.options?.length || 0))
    .slice(0, 5);

  return (
    <main className="bg-white py-8">
      <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {promoCards.map((card, index) => (
            <div key={card.title} className={`relative min-h-44 overflow-hidden rounded-lg bg-gradient-to-br ${card.className} p-6 text-white shadow-sm`}>
              <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/15" />
              <div className="absolute bottom-4 right-5 grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white">
                {index === 0 ? <BookMarked size={24} /> : index === 1 ? <FileText size={24} /> : index === 2 ? <Database size={24} /> : <Trophy size={24} />}
              </div>
              <p className="max-w-[13rem] text-2xl font-black leading-tight">{card.title}</p>
              <p className="mt-3 max-w-[15rem] text-sm font-semibold leading-6 text-white/80">{card.subtitle}</p>
            </div>
          ))}
        </section>

        <nav className="mt-8 flex gap-6 overflow-x-auto border-b border-slate-100 pb-4">
          <Link href={buildHref(filterState, { category: "" })} className={`whitespace-nowrap text-base font-semibold ${!filterState.category ? "text-ink" : "text-slate-500 hover:text-ink"}`}>
            {"\u5168\u90e8"} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{questions.length}</span>
          </Link>
          {categoryTabs.map((tab) => (
            <Link
              key={tab.category}
              href={buildHref(filterState, { category: tab.category })}
              className={`whitespace-nowrap text-base font-semibold ${filterState.category === tab.category ? "text-ink" : "text-slate-500 hover:text-ink"}`}
            >
              {tab.label} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{tab.count}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-6 flex gap-3 overflow-x-auto pb-1">
          <Link href={buildHref(filterState, { type: "" })} className={`inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-3 text-sm font-bold ${!filterState.type ? "bg-ink text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            <Tag size={16} /> {"\u5168\u90e8\u9898\u578b"}
          </Link>
          {types.map((type) => (
            <Link key={type} href={buildHref(filterState, { type })} className={`inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-3 text-sm font-bold ${filterState.type === type ? "bg-ink text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              <Sparkles size={16} /> {questionTypeLabels[type] ?? type}
            </Link>
          ))}
        </div>

        <section className="mt-6 border-t border-slate-100 pt-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <form action="/question-bank" className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="category" value={filterState.category} />
              <input type="hidden" name="type" value={filterState.type} />
              <label className="flex min-w-72 items-center gap-2 rounded-full bg-slate-100 px-4 py-3">
                <Search size={18} className="text-slate-400" />
                <input
                  name="q"
                  defaultValue={filterState.q}
                  placeholder="Search questions"
                  className="w-full bg-transparent text-sm font-semibold text-ink outline-none placeholder:text-slate-500"
                />
              </label>
              <label className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600">
                <SlidersHorizontal size={16} />
                <select name="level" defaultValue={filterState.level} className="bg-transparent outline-none">
                  <option value="">{"\u5168\u90e8\u7ea7\u522b"}</option>
                  {levels.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </label>
              <button className="rounded-full bg-ink px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">{"\u641c\u7d22"}</button>
              {filterState.q || filterState.category || filterState.type || filterState.level ? (
                <Link href="/question-bank" className="text-sm font-bold text-slate-500 hover:text-coral">{"\u6e05\u9664\u7b5b\u9009"}</Link>
              ) : null}
            </form>

            <div className="flex items-center gap-3 text-sm font-bold text-slate-500">
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2">
                <Filter size={16} /> {filteredQuestions.length}/{questions.length} {"\u9053\u9898"}
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-6 xl:grid-cols-[1fr_340px]">
            <div className="grid gap-2">
              {filteredQuestions.length ? (
                filteredQuestions.map((question, index) => <QuestionRow key={question.id} question={question} index={index} institutionsById={institutionsById} />)
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
                  <FileQuestion size={34} className="mx-auto text-slate-300" />
                  <h2 className="mt-4 text-xl font-black text-ink">
                    {filterState.q ? `\u6ca1\u6709\u627e\u5230\u5305\u542b\u201c${filterState.q}\u201d\u7684\u9898\u76ee` : "\u5f53\u524d\u7b5b\u9009\u6761\u4ef6\u4e0b\u6682\u65e0\u9898\u76ee"}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">{"\u53ef\u4ee5\u8c03\u6574\u673a\u6784\u7c7b\u522b\u3001\u9898\u578b\u3001\u7ea7\u522b\u6216\u5173\u952e\u8bcd\u540e\u518d\u8bd5\u3002"}</p>
                </div>
              )}
            </div>

            <aside className="h-fit rounded-lg bg-slate-50 p-5 ring-1 ring-slate-100">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-coral">Hot Today</p>
                  <h2 className="mt-1 text-xl font-black text-ink">{"\u70ed\u95e8\u9898\u76ee"}</h2>
                </div>
                <Trophy className="text-amber-500" size={24} />
              </div>
              <div className="mt-4 grid gap-3">
                {hotQuestions.length ? (
                  hotQuestions.map((question, index) => (
                    <div key={question.id} className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-100">
                      <div className="flex items-start gap-3">
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-xs font-black text-white">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 font-black leading-6 text-ink">{questionTitle(question)}</p>
                          <p className="mt-1 text-xs font-bold text-slate-500">
                            {questionTypeLabels[question.type] ?? question.type}{" \u00b7 "}{question.difficulty}{" \u00b7 "}{questionInstitutionName(question, institutionsById)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-sm leading-6 text-slate-500">
                    {"\u6682\u65e0\u5df2\u53d1\u5e03\u9898\u76ee\u3002"}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
