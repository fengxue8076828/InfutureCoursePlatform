import {
  difficultyOptionsByInstitutionCategory,
  getDifficultyOptionsForInstitution,
  type InstitutionCategoryValue
} from "./difficulty";

export type { InstitutionCategoryValue };
export { difficultyOptionsByInstitutionCategory, getDifficultyOptionsForInstitution };

export const institutionCategoryOptions: Array<{
  value: InstitutionCategoryValue;
  label: string;
}> = [
  { value: "it", label: "IT教育类" },
  { value: "language", label: "语言教育类" },
  { value: "tutoring", label: "课外补习类" },
  { value: "art", label: "艺术教育类" },
  { value: "other", label: "其他类" }
];

export const adminInstitution = {
  id: 1,
  name: "欧洲华文未来学院",
  slug: "euro-chinese-future",
  logo_url: "/logos/euro-future.svg",
  category: "language" as InstitutionCategoryValue,
  region: "Europe",
  website: "https://eurofuture.example",
  description: "面向欧洲华人家庭的中文、人文与升学辅导机构。",
  phone: "+49 30 0000 3939",
  email: "admin@eurofuture.example",
  address: "Friedrichstrasse 88, 10117 Berlin, Germany",
  taxId: "DE-EDU-2026-039",
  serviceHours: "周一至周五 09:00-18:00 CET",
  contactPerson: "王晓岚"
};

export const adminAccount = {
  name: "机构管理员",
  role: "超级管理员",
  avatar:
    "https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=400&q=80"
};

export const adminCourses = [
  {
    id: 1,
    title: "IB 中文阅读与写作冲刺",
    category: "语言与写作",
    level: "B1-B2",
    teacher: "林若晨",
    image:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
    chapters: 8,
    status: "已发布"
  },
  {
    id: 2,
    title: "中文 Python 项目营",
    category: "编程与 STEM",
    level: "入门",
    teacher: "周景行",
    image:
      "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1200&q=80",
    chapters: 6,
    status: "已发布"
  },
  {
    id: 3,
    title: "少儿中文口语表达",
    category: "少儿中文",
    level: "A1-A2",
    teacher: "陈一诺",
    image:
      "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80",
    chapters: 10,
    status: "草稿"
  }
];

export const dashboardRanges = [
  { key: "week", label: "近一周", total: 38, growth: "+12%" },
  { key: "month", label: "近一个月", total: 126, growth: "+18%" },
  { key: "year", label: "近一年", total: 1380, growth: "+41%" }
];

export const courseRankings = adminCourses.map((course, index) => ({
  id: course.id,
  title: course.title,
  teacher: course.teacher,
  subscriptions: [412, 328, 286][index] ?? 120,
  revenue: ([412, 328, 286][index] ?? 120) * 39,
  completionRate: [78, 69, 83][index] ?? 72,
  growth: [18, 14, 22][index] ?? 9,
  trend: [
    [34, 42, 58, 74, 98, 126, 168],
    [22, 30, 44, 52, 67, 88, 113],
    [18, 26, 39, 50, 72, 91, 108]
  ][index] ?? [12, 20, 24, 31, 40, 48, 52]
}));

export const usefulMetrics = [
  { label: "本月新增订阅", value: "126", hint: "比上月 +18%" },
  { label: "月经常收入", value: "4914欧", hint: "按 39欧/课/月计算" },
  { label: "平均完课率", value: "76%", hint: "过去 30 天" },
  { label: "待人工批改", value: "8", hint: "口语/写作/上传题" }
];

export const teacherUsers = [
  {
    id: 1,
    name: "林若晨",
    email: "lin@example.com",
    role: "教学主管",
    title: "IB 中文与写作导师",
    avatar_url:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80",
    permissions: ["主页面板", "课程管理", "题库管理", "老师管理", "测验批改", "博客管理"],
    assignedCourses: ["IB 中文阅读与写作冲刺"],
    status: "启用"
  },
  {
    id: 2,
    name: "周景行",
    email: "zhou@example.com",
    role: "授课老师",
    title: "Python 与算法启蒙导师",
    avatar_url:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80",
    permissions: ["课程管理", "题库管理", "测验批改"],
    assignedCourses: ["中文 Python 项目营"],
    status: "启用"
  },
  {
    id: 3,
    name: "陈一诺",
    email: "chen@example.com",
    role: "授课老师",
    title: "少儿中文口语导师",
    avatar_url:
      "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=600&q=80",
    permissions: ["课程管理", "题库管理", "测验批改"],
    assignedCourses: ["少儿中文口语表达"],
    status: "启用"
  }
];

export const fallbackAdminQuestions = [
  {
    id: 1,
    institution_id: 1,
    course_id: 1,
    type: "fill_blank",
    prompt: "请根据语境补全句子：我今天____去图书馆。",
    content: { title: "关键词语境填空" },
    answer_key: { answers: ["想", "要"] },
    skill_area: "阅读理解",
    difficulty: "A2",
    points: 10,
    requires_manual_grading: false,
    options: [
      { id: 1, label: "空1", text: "想", is_correct: true, position: 1 },
      { id: 2, label: "空1", text: "要", is_correct: true, position: 2 }
    ],
    media_assets: []
  },
  {
    id: 2,
    institution_id: 1,
    course_id: 1,
    type: "single_choice",
    prompt: "下列哪一项最能概括文章主旨？",
    content: { title: "文章主旨判断" },
    answer_key: { answer: "A" },
    skill_area: "阅读理解",
    difficulty: "B1",
    points: 10,
    requires_manual_grading: false,
    options: [
      { id: 3, label: "A", text: "人物成长", is_correct: true, position: 1 },
      { id: 4, label: "B", text: "时间顺序", is_correct: false, position: 2 },
      { id: 5, label: "C", text: "地点变化", is_correct: false, position: 3 },
      { id: 6, label: "D", text: "修辞手法", is_correct: false, position: 4 }
    ],
    media_assets: []
  },
  {
    id: 3,
    institution_id: 1,
    course_id: 1,
    type: "multiple_choice",
    prompt: "下面哪些表达适合用于议论文结尾？",
    content: { title: "议论文表达多选" },
    answer_key: { answers: ["A", "C"] },
    skill_area: "写作",
    difficulty: "B1",
    points: 10,
    requires_manual_grading: false,
    options: [
      { id: 7, label: "A", text: "综上所述", is_correct: true, position: 1 },
      { id: 8, label: "B", text: "从前有一天", is_correct: false, position: 2 },
      { id: 9, label: "C", text: "因此我认为", is_correct: true, position: 3 },
      { id: 10, label: "D", text: "哈哈真好玩", is_correct: false, position: 4 }
    ],
    media_assets: []
  },
  {
    id: 4,
    institution_id: 1,
    course_id: 2,
    type: "coding",
    prompt: "编写一个函数，返回列表中的最大值。",
    content: {
      title: "列表最大值函数",
      starter_code: "def max_number(items):\n    pass",
      tests: ["max_number([1, 3, 2]) == 3"]
    },
    answer_key: { answer: "custom_test" },
    skill_area: "Python",
    difficulty: "简单",
    points: 10,
    requires_manual_grading: false,
    options: [],
    media_assets: []
  }
];

export const gradingQueue = [
  {
    id: 1,
    student: "李明",
    course: "少儿中文口语表达",
    question: "朗读短句：今天我想介绍我的城市",
    type: "口语音频",
    submittedAt: "2026-06-20 18:34",
    rubric: ["声调", "流利度", "完整度"],
    attachment: "student-audio-demo.wav"
  },
  {
    id: 2,
    student: "",
    course: "IB 中文阅读与写作冲刺",
    question: "写作题：我如何理解文本中的人物变化",
    type: "开放写作",
    submittedAt: "2026-06-21 09:12",
    rubric: ["结构", "论据", "语言准确性"],
    attachment: "essay.pdf"
  }
];

export const adminBlogPosts = [
  {
    id: 1,
    title: "海外家庭如何选择中文在线课程",
    excerpt: "从时区、师资、反馈频率和测评体系四个角度快速判断。",
    cover_url:
      "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80",
    status: "已发布",
    views: 1832,
    channel: "首页推荐"
  },
  {
    id: 2,
    title: "用中文学编程，对双语孩子有什么帮助",
    excerpt: "编程课不仅是技术训练，也能增强抽象表达和中文学术词汇。",
    cover_url:
      "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1200&q=80",
    status: "草稿",
    views: 946,
    channel: "博客频道"
  }
];
