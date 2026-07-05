import {
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  ClipboardCheck,
  Layers3,
  Lightbulb,
  PenLine,
  Trophy
} from "lucide-react";
import Link from "next/link";

const questionTypes = [
  ["填空题", "适合词汇、语法、句型和关键概念训练。"],
  ["单选题", "适合基础概念、阅读理解和知识点辨析。"],
  ["多选题", "适合综合判断、细节提取和多条件推理。"],
  ["开放式答案", "适合写作表达、观点阐述和老师人工批改。"]
];

const practiceFlow = [
  ["选择级别", "按课程级别和知识点定位适合自己的练习。"],
  ["查看提示", "遇到困难时可以查看 hint，保留思考空间。"],
  ["提交答案", "客观题自动判卷，主观题进入老师批改流程。"],
  ["获得积分", "练习完成、测验高分和持续学习都会提升积分。"]
];

export default function QuestionBankPage() {
  return (
    <main className="bg-[#f7fbfb]">
      <section className="bg-ink text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:px-8">
          <div className="flex flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-bold text-sunshine">
              <BrainCircuit size={16} />
              Question Bank
            </div>
            <h1 className="mt-5 text-4xl font-black leading-tight sm:text-5xl">
              题库练习中心
              <span className="mt-2 block text-mint">把薄弱知识点练扎实</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-200">
              这里集中展示平台题库能力。学生可以围绕课程级别、题型和知识点进行专项练习，完成练习和高分测验都会进入积分体系。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/courses" className="inline-flex items-center gap-2 rounded-lg bg-coral px-5 py-3 text-sm font-bold text-white hover:bg-[#f25f54]">
                先选择课程 <ArrowRight size={18} />
              </Link>
              <Link href="/learn" className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white hover:border-mint hover:text-mint">
                进入我的课堂 <BookOpenCheck size={18} />
              </Link>
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/10 p-5 shadow-soft">
            <div className="rounded-lg bg-white p-5 text-ink">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-coral">专项练习预览</p>
                  <h2 className="mt-1 text-2xl font-black">智能练习路径</h2>
                </div>
                <span className="grid h-12 w-12 place-items-center rounded-lg bg-mint/15 text-mint">
                  <ClipboardCheck size={26} />
                </span>
              </div>
              <div className="mt-5 grid gap-3">
                {questionTypes.map(([title, text]) => (
                  <div key={title} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                    <p className="font-black text-ink">{title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-4 md:grid-cols-4">
            {practiceFlow.map(([title, text], index) => (
              <div key={title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-mint/15 text-sm font-black text-mint">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-black text-ink">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-14">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-3 lg:px-8">
          {[
            ["多题型支持", "支持选择、填空、开放式答案等题型，后续可扩展听力、口语、编程题。", Layers3],
            ["提示与复盘", "题目可以配置 hint，学生在练习时按需查看提示，减少卡住后的挫败感。", Lightbulb],
            ["积分激励", "练习完成、测验分数和学习速度会共同影响学生积分和排名。", Trophy]
          ].map(([title, text, Icon]) => (
            <div key={title as string} className="rounded-lg border border-slate-200 bg-slate-50 p-6">
              <Icon size={24} className="text-coral" />
              <h3 className="mt-4 text-xl font-black text-ink">{title as string}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{text as string}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft md:p-8">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="font-bold text-coral">题库与课程联动</p>
                <h2 className="mt-2 text-3xl font-black text-ink">题目会在课程练习和测验中使用</h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                  老师在后台题库管理中发布题目后，可以在课程章节里选择题目组成练习或测验。学生在个人课堂答题后，结果会保存并进入学习进度。
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/courses" className="inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">
                  浏览课程 <ArrowRight size={18} />
                </Link>
                <Link href="/register" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-ink hover:border-mint hover:text-mint">
                  创建学生账号 <PenLine size={18} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
