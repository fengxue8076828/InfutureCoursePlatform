import type { BlogPost, Course, Enrollment, Institution, Teacher } from "./types";

export const institutions: Institution[] = [
  {
    id: 1,
    name: "欧洲华文未来学院",
    slug: "euro-chinese-future",
    logo_url: "/logos/euro-future.svg",
    category: "language",
    region: "Europe",
    description: "面向欧洲华人家庭的中文、人文与升学辅导机构。"
  },
  {
    id: 2,
    name: "寰宇 STEM 中文课堂",
    slug: "global-stem-cn",
    logo_url: "/logos/stem-cn.svg",
    category: "it",
    region: "Global",
    description: "用中文教授数学、编程与科学素养的在线学校。"
  },
  {
    id: 3,
    name: "青橙语言工坊",
    slug: "green-orange-language",
    logo_url: "/logos/orange-language.svg",
    category: "language",
    region: "Europe",
    description: "专注双语表达、阅读写作和青少年演讲训练。"
  }
];

export const teachers: Teacher[] = [
  {
    id: 1,
    name: "林若晨",
    slug: "lin-ruochen",
    title: "IB 中文与写作导师",
    bio: "十年国际中文教学经验，擅长把文学阅读拆成清晰、有成就感的训练路径。",
    avatar_url:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80",
    region: "Berlin",
    specialties: { items: ["IB Chinese", "Creative Writing", "阅读理解"] },
    institution: institutions[0]
  },
  {
    id: 2,
    name: "周景行",
    slug: "zhou-jingxing",
    title: "Python 与算法启蒙导师",
    bio: "前软件工程师，长期帮助海外中文学生建立编程思维和项目能力。",
    avatar_url:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80",
    region: "Paris",
    specialties: { items: ["Python", "算法", "项目制学习"] },
    institution: institutions[1]
  },
  {
    id: 3,
    name: "陈一诺",
    slug: "chen-yinuo",
    title: "少儿中文口语导师",
    bio: "擅长用故事、发音反馈和任务式练习帮助孩子敢说中文。",
    avatar_url:
      "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=600&q=80",
    region: "Amsterdam",
    specialties: { items: ["口语", "发音", "少儿中文"] },
    institution: institutions[2]
  }
];

const chapters = (courseSlug: string) => [
  {
    id: 1,
    title: "1. 启航",
    summary: "视频、讲义、练习和本课测验按顺序解锁。",
    position: 1,
    items: [
      {
        id: 11,
        title: "启航视频课",
        item_type: "video" as const,
        content_url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        body: { duration: "18:00" },
        required_minutes: 18,
        position: 1
      },
      {
        id: 12,
        title: "启航讲义",
        item_type: "handout" as const,
        content_url: null,
        body: { markdown: "关键概念、例题、课后任务" },
        required_minutes: 8,
        position: 2
      },
      {
        id: 13,
        title: "启航课上练习",
        item_type: "exercise" as const,
        content_url: null,
        body: { types: ["单选", "填空", courseSlug.includes("python") ? "编程题" : "阅读题"] },
        required_minutes: 15,
        position: 3
      },
      {
        id: 14,
        title: "启航测验",
        item_type: "quiz" as const,
        content_url: null,
        body: { passing_score: 70 },
        required_minutes: 20,
        position: 4
      }
    ]
  },
  {
    id: 2,
    title: "2. 核心训练",
    summary: "围绕课程目标做高频训练与反馈。",
    position: 2,
    items: [
      {
        id: 21,
        title: "核心训练视频课",
        item_type: "video" as const,
        content_url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        body: { duration: "22:00" },
        required_minutes: 22,
        position: 1
      },
      {
        id: 22,
        title: "核心训练练习",
        item_type: "exercise" as const,
        content_url: null,
        body: { types: ["多选", "判断", "写作/上传"] },
        required_minutes: 18,
        position: 2
      }
    ]
  }
];

export const courses: Course[] = [
  {
    id: 1,
    slug: "ib-chinese-reading-writing",
    title: "IB 中文阅读与写作冲刺",
    subtitle: "12 周建立文本分析、结构化表达与高分作文能力",
    description: "适合欧洲及全球 IB 中文学生，围绕真实文本、写作模板和批改反馈展开。",
    category: "语言与写作",
    level: "B1-B2",
    price_eur_monthly: 39,
    hero_image_url:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
    intro_video_url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    syllabus: { items: ["文学文本精读", "议论文结构", "口头表达", "模拟测评"] },
    tags: { items: ["IB", "写作", "阅读"] },
    is_hot: true,
    students_count: 328,
    institution: institutions[0],
    teacher: teachers[0],
    chapters: chapters("ib-chinese-reading-writing")
  },
  {
    id: 2,
    slug: "python-for-chinese-teens",
    title: "中文 Python 项目营",
    subtitle: "用中文完成 6 个真实小项目，从语法到调试都讲透",
    description: "课程含在线代码编辑、自动测试、修改代码题与项目点评。",
    category: "编程与 STEM",
    level: "入门",
    price_eur_monthly: 39,
    hero_image_url:
      "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1200&q=80",
    intro_video_url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    syllabus: { items: ["变量与条件", "循环与函数", "数据结构", "小游戏项目"] },
    tags: { items: ["Python", "编程", "青少年"] },
    is_hot: true,
    students_count: 412,
    institution: institutions[1],
    teacher: teachers[1],
    chapters: chapters("python-for-chinese-teens")
  },
  {
    id: 3,
    slug: "kids-mandarin-speaking",
    title: "少儿中文口语表达",
    subtitle: "每周主题对话、发音录音反馈和故事复述训练",
    description: "适合 7-12 岁海外中文学习者，强化日常表达与自信开口。",
    category: "少儿中文",
    level: "A1-A2",
    price_eur_monthly: 39,
    hero_image_url:
      "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80",
    intro_video_url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    syllabus: { items: ["家庭主题", "校园主题", "故事复述", "发音挑战"] },
    tags: { items: ["口语", "发音", "儿童"] },
    is_hot: true,
    students_count: 286,
    institution: institutions[2],
    teacher: teachers[2],
    chapters: chapters("kids-mandarin-speaking")
  }
];

export const blogPosts: BlogPost[] = [
  {
    id: 1,
    slug: "how-to-choose-online-chinese-course",
    title: "海外家庭如何选择中文在线课程",
    excerpt: "从时区、师资、反馈频率和测评体系四个角度快速判断。",
    cover_url:
      "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80",
    content: "选择课程时，先看孩子的目标，再看课程是否能持续提供反馈和成果记录。",
    author_name: "HuaLearn 编辑部",
    created_at: "2026-06-01T10:00:00Z"
  },
  {
    id: 2,
    slug: "coding-in-chinese-for-bilingual-kids",
    title: "用中文学编程，对双语孩子有什么帮助",
    excerpt: "编程课不仅是技术训练，也能增强抽象表达和中文学术词汇。",
    cover_url:
      "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1200&q=80",
    content: "双语编程学习能让学生在逻辑表达、项目协作和中文术语之间建立连接。",
    author_name: "周景行",
    created_at: "2026-06-08T10:00:00Z"
  }
];

export const enrollments: Enrollment[] = [
  { id: 1, status: "active", progress_percent: 35, course: courses[0] },
  { id: 2, status: "active", progress_percent: 70, course: courses[1] },
  { id: 3, status: "completed", progress_percent: 100, course: courses[2] }
];
