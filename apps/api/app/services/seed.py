from __future__ import annotations

from datetime import datetime, timedelta

from passlib.context import CryptContext
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from app.models import (
    BlogPost,
    Course,
    CourseChapter,
    CourseStatus,
    Enrollment,
    Institution,
    LessonItem,
    LessonItemType,
    Question,
    QuestionMedia,
    QuestionOption,
    QuestionType,
    Submission,
    Subscription,
    Teacher,
    User,
    UserRole,
)

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

LEGACY_DEMO_COURSE_SLUGS = {
    "ib-chinese-reading-writing",
    "python-for-chinese-teens",
    "kids-mandarin-speaking",
}


def ensure_schema_extensions(db: Session) -> None:
    inspector = inspect(db.get_bind())
    try:
        db.execute(text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'teacher'"))
        db.commit()
    except Exception:
        db.rollback()

    if "institutions" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("institutions")}
    column_sql = {
        "category": "ALTER TABLE institutions ADD COLUMN category VARCHAR(40) NOT NULL DEFAULT 'language'",
        "phone": "ALTER TABLE institutions ADD COLUMN phone VARCHAR(80)",
        "email": "ALTER TABLE institutions ADD COLUMN email VARCHAR(255)",
        "address": "ALTER TABLE institutions ADD COLUMN address VARCHAR(500)",
        "contact_person": "ALTER TABLE institutions ADD COLUMN contact_person VARCHAR(120)",
        "institution_type": "ALTER TABLE institutions ADD COLUMN institution_type VARCHAR(32) NOT NULL DEFAULT 'individual'",
        "payout_mode": "ALTER TABLE institutions ADD COLUMN payout_mode VARCHAR(32) NOT NULL DEFAULT 'partner'",
        "service_agreement_accepted": "ALTER TABLE institutions ADD COLUMN service_agreement_accepted BOOLEAN NOT NULL DEFAULT FALSE",
        "gdpr_agreement_accepted": "ALTER TABLE institutions ADD COLUMN gdpr_agreement_accepted BOOLEAN NOT NULL DEFAULT FALSE",
        "fee_agreement_accepted": "ALTER TABLE institutions ADD COLUMN fee_agreement_accepted BOOLEAN NOT NULL DEFAULT FALSE",
        "agreements_accepted_at": "ALTER TABLE institutions ADD COLUMN agreements_accepted_at TIMESTAMP WITH TIME ZONE",
        "verification_status": "ALTER TABLE institutions ADD COLUMN verification_status VARCHAR(32) NOT NULL DEFAULT 'not_required'",
        "stripe_account_id": "ALTER TABLE institutions ADD COLUMN stripe_account_id VARCHAR(120)",
        "stripe_charges_enabled": "ALTER TABLE institutions ADD COLUMN stripe_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE",
        "stripe_payouts_enabled": "ALTER TABLE institutions ADD COLUMN stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE",
        "stripe_details_submitted": "ALTER TABLE institutions ADD COLUMN stripe_details_submitted BOOLEAN NOT NULL DEFAULT FALSE",
        "stripe_onboarding_completed_at": "ALTER TABLE institutions ADD COLUMN stripe_onboarding_completed_at TIMESTAMP WITH TIME ZONE",
        "legal_company_name": "ALTER TABLE institutions ADD COLUMN legal_company_name VARCHAR(200)",
        "registration_country": "ALTER TABLE institutions ADD COLUMN registration_country VARCHAR(120)",
        "registered_address": "ALTER TABLE institutions ADD COLUMN registered_address VARCHAR(500)",
        "legal_representative": "ALTER TABLE institutions ADD COLUMN legal_representative VARCHAR(120)",
        "founded_on": "ALTER TABLE institutions ADD COLUMN founded_on DATE",
    }
    for column_name, statement in column_sql.items():
        if column_name not in columns:
            db.execute(text(statement))

    db.execute(text("ALTER TABLE institutions ALTER COLUMN logo_url TYPE TEXT"))
    db.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_institutions_stripe_account_id ON institutions(stripe_account_id) WHERE stripe_account_id IS NOT NULL"))
    db.execute(
        text(
            """
            UPDATE institutions
            SET payout_mode = 'platform',
                institution_type = 'organization',
                verification_status = 'approved',
                service_agreement_accepted = TRUE,
                gdpr_agreement_accepted = TRUE,
                fee_agreement_accepted = TRUE,
                agreements_accepted_at = COALESCE(agreements_accepted_at, created_at)
            WHERE lower(name) LIKE '%infuture%'
               OR lower(slug) LIKE '%infuture%'
               OR lower(COALESCE(email, '')) LIKE '%infuture%'
            """
        )
    )
    db.execute(
        text(
            """
            UPDATE institutions
            SET payout_mode = 'partner'
            WHERE payout_mode IS NULL OR payout_mode = ''
            """
        )
    )
    db.execute(
        text(
            """
            UPDATE institutions
            SET service_agreement_accepted = TRUE,
                gdpr_agreement_accepted = TRUE,
                fee_agreement_accepted = TRUE,
                agreements_accepted_at = COALESCE(agreements_accepted_at, created_at)
            WHERE agreements_accepted_at IS NULL
              AND (service_agreement_accepted = FALSE OR gdpr_agreement_accepted = FALSE OR fee_agreement_accepted = FALSE)
            """
        )
    )
    db.execute(
        text(
            """
            UPDATE institutions
            SET verification_status = CASE
                WHEN institution_type = 'organization' THEN COALESCE(NULLIF(verification_status, ''), 'unsubmitted')
                ELSE 'not_required'
            END
            WHERE verification_status IS NULL OR verification_status = '' OR institution_type <> 'organization'
            """
        )
    )
    db.execute(text("ALTER TABLE question_media ALTER COLUMN url TYPE TEXT"))
    if "questions" in inspector.get_table_names():
        question_columns = {column["name"] for column in inspector.get_columns("questions")}
        if "status" not in question_columns:
            db.execute(
                text("ALTER TABLE questions ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'saved'")
            )
        if "created_by_user_id" not in question_columns:
            db.execute(text("ALTER TABLE questions ADD COLUMN created_by_user_id INTEGER REFERENCES users(id)"))
            db.execute(text("CREATE INDEX IF NOT EXISTS ix_questions_created_by_user_id ON questions(created_by_user_id)"))
        if "hint" not in question_columns:
            db.execute(text("ALTER TABLE questions ADD COLUMN hint TEXT"))
        db.execute(
            text(
                """
                UPDATE questions q
                SET created_by_user_id = COALESCE(
                    (
                        SELECT u.id
                        FROM users u
                        WHERE u.institution_id = q.institution_id
                          AND u.role::text IN ('teacher', 'institution_admin', 'super_admin')
                        ORDER BY
                          CASE
                            WHEN u.role::text = 'teacher' THEN 0
                            WHEN u.role::text = 'super_admin' THEN 1
                            ELSE 2
                          END,
                          u.id
                        LIMIT 1
                    ),
                    (SELECT u.id FROM users u ORDER BY u.id LIMIT 1)
                )
                WHERE q.created_by_user_id IS NULL
                """
            )
        )
    if "teachers" in inspector.get_table_names():
        db.execute(text("ALTER TABLE teachers ALTER COLUMN avatar_url TYPE TEXT"))

    if "student_posts" in inspector.get_table_names():
        student_post_columns = {column["name"] for column in inspector.get_columns("student_posts")}
        if "image_urls" not in student_post_columns:
            db.execute(text("ALTER TABLE student_posts ADD COLUMN image_urls JSONB NOT NULL DEFAULT '[]'::jsonb"))
        if "likes_count" not in student_post_columns:
            db.execute(text("ALTER TABLE student_posts ADD COLUMN likes_count INTEGER NOT NULL DEFAULT 0"))

    if "course_categories" in inspector.get_table_names():
        course_category_columns = {column["name"] for column in inspector.get_columns("course_categories")}
        if "institution_id" not in course_category_columns:
            db.execute(text("ALTER TABLE course_categories ADD COLUMN institution_id INTEGER"))
            db.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_course_categories_institution_id "
                    "ON course_categories(institution_id)"
                )
            )
        db.execute(
            text(
                """
                UPDATE course_categories
                SET institution_id = matched.institution_id
                FROM (
                    SELECT cc.id, MIN(c.institution_id) AS institution_id
                    FROM course_categories cc
                    JOIN courses c
                      ON c.category = cc.name
                      OR c.category LIKE cc.name || ' / %'
                      OR c.category LIKE '% / ' || cc.name
                    WHERE c.institution_id IS NOT NULL
                    GROUP BY cc.id
                ) matched
                WHERE course_categories.id = matched.id
                  AND course_categories.institution_id IS DISTINCT FROM matched.institution_id
                """
            )
        )
        db.execute(
            text(
                """
                UPDATE course_categories child
                SET institution_id = parent.institution_id
                FROM course_categories parent
                WHERE child.parent_id = parent.id
                  AND child.institution_id IS NULL
                  AND parent.institution_id IS NOT NULL
                """
            )
        )
        db.execute(
            text(
                """
                UPDATE course_categories parent
                SET institution_id = child.institution_id
                FROM course_categories child
                WHERE child.parent_id = parent.id
                  AND parent.institution_id IS NULL
                  AND child.institution_id IS NOT NULL
                """
            )
        )

    if "learning_paths" in inspector.get_table_names():
        learning_path_columns = {column["name"] for column in inspector.get_columns("learning_paths")}
        if "intro_video_url" not in learning_path_columns:
            db.execute(text("ALTER TABLE learning_paths ADD COLUMN intro_video_url VARCHAR(500) NOT NULL DEFAULT ''"))

    if "subscriptions" in inspector.get_table_names():
        subscription_columns = {column["name"] for column in inspector.get_columns("subscriptions")}
        subscription_column_sql = {
            "stripe_checkout_session_id": "ALTER TABLE subscriptions ADD COLUMN stripe_checkout_session_id VARCHAR(255)",
            "stripe_subscription_id": "ALTER TABLE subscriptions ADD COLUMN stripe_subscription_id VARCHAR(255)",
            "stripe_customer_id": "ALTER TABLE subscriptions ADD COLUMN stripe_customer_id VARCHAR(255)",
            "platform_fee_percent": "ALTER TABLE subscriptions ADD COLUMN platform_fee_percent NUMERIC(5, 2) NOT NULL DEFAULT 15.00",
        }
        for column_name, statement in subscription_column_sql.items():
            if column_name not in subscription_columns:
                db.execute(text(statement))
        db.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_subscriptions_stripe_checkout_session_id ON subscriptions(stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL"))
        db.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL"))
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id)"))

    if "submissions" in inspector.get_table_names():
        submission_columns = {column["name"] for column in inspector.get_columns("submissions")}
        if "lesson_item_id" not in submission_columns:
            db.execute(text("ALTER TABLE submissions ADD COLUMN lesson_item_id INTEGER REFERENCES lesson_items(id)"))
            db.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_submissions_lesson_item_id "
                    "ON submissions(lesson_item_id)"
                )
            )

    if "users" in inspector.get_table_names():
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        user_column_sql = {
            "title": "ALTER TABLE users ADD COLUMN title VARCHAR(160)",
            "phone": "ALTER TABLE users ADD COLUMN phone VARCHAR(80)",
            "region": "ALTER TABLE users ADD COLUMN region VARCHAR(80)",
            "bio": "ALTER TABLE users ADD COLUMN bio TEXT",
        }
        for column_name, statement in user_column_sql.items():
            if column_name not in user_columns:
                db.execute(text(statement))
        db.execute(text("ALTER TABLE users ALTER COLUMN avatar_url TYPE TEXT"))

    db.execute(
        text(
            """
            UPDATE institutions
            SET category = CASE
                WHEN slug = 'global-stem-cn' THEN 'it'
                WHEN slug IN ('euro-chinese-future', 'green-orange-language') THEN 'language'
                ELSE COALESCE(category, 'other')
            END
            """
        )
    )
    db.commit()


def remove_legacy_demo_courses(db: Session) -> None:
    demo_courses = list(
        db.scalars(select(Course).where(Course.slug.in_(LEGACY_DEMO_COURSE_SLUGS)))
    )
    if not demo_courses:
        return

    for course in demo_courses:
        for question in course.questions:
            question.course_id = None

        enrollment_count = (
            db.scalar(select(Enrollment.id).where(Enrollment.course_id == course.id).limit(1))
            is not None
        )
        subscription_count = (
            db.scalar(select(Subscription.id).where(Subscription.course_id == course.id).limit(1))
            is not None
        )
        if enrollment_count or subscription_count:
            course.status = CourseStatus.archived
        else:
            db.delete(course)


def seed_database(db: Session) -> None:
    ensure_schema_extensions(db)
    existing = db.scalar(select(Institution))
    if existing:
        ensure_question_bank_details(db)
        remove_legacy_demo_courses(db)
        db.commit()
        return

    institutions = [
        Institution(
            name="欧洲华文未来学院",
            slug="euro-chinese-future",
            logo_url="/logos/euro-future.svg",
            category="language",
            region="Europe",
            website="https://example.com/euro",
            phone="+49 30 0000 3939",
            email="admin@eurofuture.example",
            address="Friedrichstrasse 88, 10117 Berlin, Germany",
            contact_person="王晓岚",
            description="面向欧洲华人家庭的中文、人文与升学辅导机构。",
        ),
        Institution(
            name="寰宇 STEM 中文课堂",
            slug="global-stem-cn",
            logo_url="/logos/stem-cn.svg",
            category="it",
            region="Global",
            website="https://example.com/stem",
            phone="+33 1 0000 3939",
            email="admin@stem-cn.example",
            address="Remote · Global",
            contact_person="周景行",
            description="用中文教授数学、编程与科学素养的在线学校。",
        ),
        Institution(
            name="青橙语言工坊",
            slug="green-orange-language",
            logo_url="/logos/orange-language.svg",
            category="language",
            region="Europe",
            website="https://example.com/language",
            phone="+31 20 0000 3939",
            email="hello@orange-language.example",
            address="Amsterdam, Netherlands",
            contact_person="陈一诺",
            description="专注双语表达、阅读写作和青少年演讲训练。",
        ),
    ]
    db.add_all(institutions)
    db.flush()

    teachers = [
        Teacher(
            name="林若晨",
            slug="lin-ruochen",
            title="IB 中文与写作导师",
            bio="十年国际中文教学经验，擅长把文学阅读拆成清晰、有成就感的训练路径。",
            avatar_url="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80",
            institution_id=institutions[0].id,
            region="Berlin",
            specialties={"items": ["IB Chinese", "Creative Writing", "阅读理解"]},
        ),
        Teacher(
            name="周景行",
            slug="zhou-jingxing",
            title="Python 与算法启蒙导师",
            bio="前软件工程师，长期帮助海外中文学生建立编程思维和项目能力。",
            avatar_url="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80",
            institution_id=institutions[1].id,
            region="Paris",
            specialties={"items": ["Python", "算法", "项目制学习"]},
        ),
        Teacher(
            name="陈一诺",
            slug="chen-yinuo",
            title="少儿中文口语导师",
            bio="擅长用故事、发音反馈和任务式练习帮助孩子敢说中文。",
            avatar_url="https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=600&q=80",
            institution_id=institutions[2].id,
            region="Amsterdam",
            specialties={"items": ["口语", "发音", "少儿中文"]},
        ),
    ]
    db.add_all(teachers)
    db.flush()

    courses = [
        Course(
            slug="ib-chinese-reading-writing",
            title="IB 中文阅读与写作冲刺",
            subtitle="12 周建立文本分析、结构化表达与高分作文能力",
            description="适合欧洲及全球 IB 中文学生，围绕真实文本、写作模板和批改反馈展开。",
            category="语言与写作",
            level="B1-B2",
            hero_image_url="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
            intro_video_url="https://www.youtube.com/embed/dQw4w9WgXcQ",
            syllabus={"items": ["文学文本精读", "议论文结构", "口头表达", "模拟测评"]},
            tags={"items": ["IB", "写作", "阅读"]},
            is_hot=True,
            students_count=328,
            institution_id=institutions[0].id,
            teacher_id=teachers[0].id,
        ),
        Course(
            slug="python-for-chinese-teens",
            title="中文 Python 项目营",
            subtitle="用中文完成 6 个真实小项目，从语法到调试都讲透",
            description="课程含在线代码编辑、自动测试、修改代码题与项目点评。",
            category="编程与 STEM",
            level="入门",
            hero_image_url="https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1200&q=80",
            intro_video_url="https://www.youtube.com/embed/dQw4w9WgXcQ",
            syllabus={"items": ["变量与条件", "循环与函数", "数据结构", "小游戏项目"]},
            tags={"items": ["Python", "编程", "青少年"]},
            is_hot=True,
            students_count=412,
            institution_id=institutions[1].id,
            teacher_id=teachers[1].id,
        ),
        Course(
            slug="kids-mandarin-speaking",
            title="少儿中文口语表达",
            subtitle="每周主题对话、发音录音反馈和故事复述训练",
            description="适合 7-12 岁海外中文学习者，强化日常表达与自信开口。",
            category="少儿中文",
            level="A1-A2",
            hero_image_url="https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80",
            intro_video_url="https://www.youtube.com/embed/dQw4w9WgXcQ",
            syllabus={"items": ["家庭主题", "校园主题", "故事复述", "发音挑战"]},
            tags={"items": ["口语", "发音", "儿童"]},
            is_hot=True,
            students_count=286,
            institution_id=institutions[2].id,
            teacher_id=teachers[2].id,
        ),
    ]
    db.add_all(courses)
    db.flush()

    for course in courses:
        for chapter_index, chapter_title in enumerate(["启航", "核心训练", "项目与测验"], start=1):
            chapter = CourseChapter(
                course_id=course.id,
                title=f"{chapter_index}. {chapter_title}",
                summary="视频、讲义、练习和本课测验按顺序解锁。",
                position=chapter_index,
            )
            db.add(chapter)
            db.flush()
            db.add_all(
                [
                    LessonItem(
                        chapter_id=chapter.id,
                        title=f"{chapter_title}视频课",
                        item_type=LessonItemType.video,
                        content_url=course.intro_video_url,
                        body={"duration": "18:00", "transcript": "本节课重点讲解核心概念。"},
                        required_minutes=18,
                        position=1,
                    ),
                    LessonItem(
                        chapter_id=chapter.id,
                        title=f"{chapter_title}讲义",
                        item_type=LessonItemType.handout,
                        content_url=None,
                        body={"markdown": "## 本课讲义\n- 关键概念\n- 例题\n- 课后任务"},
                        required_minutes=8,
                        position=2,
                    ),
                    LessonItem(
                        chapter_id=chapter.id,
                        title=f"{chapter_title}课上练习",
                        item_type=LessonItemType.exercise,
                        content_url=None,
                        body={"question_types": ["single_choice", "fill_blank", "coding"]},
                        required_minutes=15,
                        position=3,
                    ),
                    LessonItem(
                        chapter_id=chapter.id,
                        title=f"{chapter_title}测验",
                        item_type=LessonItemType.quiz,
                        content_url=None,
                        body={"passing_score": 70},
                        required_minutes=20,
                        position=4,
                    ),
                ]
            )

    student = User(
        email="student@example.com",
        full_name="李明",
        role=UserRole.student,
        hashed_password=pwd_context.hash("password123"),
        avatar_url="https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=400&q=80",
    )
    admin = User(
        email="admin@example.com",
        full_name="机构管理员",
        role=UserRole.institution_admin,
        hashed_password=pwd_context.hash("password123"),
        institution_id=institutions[0].id,
    )
    db.add_all([student, admin])
    db.flush()

    for index, course in enumerate(courses, start=1):
        db.add(
            Enrollment(
                user_id=student.id,
                course_id=course.id,
                progress_percent=35 * index if index < 3 else 100,
                status="completed" if index == 3 else "active",
            )
        )
        db.add(
            Subscription(
                user_id=student.id,
                course_id=course.id,
                amount_eur_monthly=float(course.price_eur_monthly or 39),
                status="active",
                current_period_end=datetime.utcnow() + timedelta(days=30),
            )
        )

    questions = [
        Question(
            institution_id=institutions[0].id,
            course_id=courses[0].id,
            type=QuestionType.single_choice,
            prompt="下列哪一项最能概括文章主旨？",
            content={"options": ["人物成长", "时间顺序", "地点变化", "修辞手法"]},
            answer_key={"answer": "人物成长"},
            skill_area="阅读理解",
            difficulty="B1",
        ),
        Question(
            institution_id=institutions[1].id,
            course_id=courses[1].id,
            type=QuestionType.coding,
            prompt="编写一个函数，返回列表中的最大值。",
            content={
                "language": "python",
                "starter_code": "def max_number(items):\n    pass",
                "tests": ["max_number([1, 3, 2]) == 3"],
            },
            answer_key={"answer": "custom_test"},
            skill_area="Python",
            difficulty="入门",
            requires_manual_grading=False,
        ),
        Question(
            institution_id=institutions[2].id,
            course_id=courses[2].id,
            type=QuestionType.pronunciation,
            prompt="请朗读短句并上传音频：今天我想介绍我的城市。",
            content={"upload": "audio", "rubric": ["声调", "流利度", "完整度"]},
            answer_key={},
            skill_area="口语",
            difficulty="A2",
            requires_manual_grading=True,
        ),
    ]
    db.add_all(questions)
    db.flush()
    ensure_question_bank_details(db)
    db.add(
        Submission(
            user_id=student.id,
            question_id=questions[2].id,
            answer={"audio_url": "https://example.com/audio/demo.wav"},
            status="pending_manual",
        )
    )

    db.add_all(
        [
            BlogPost(
                slug="how-to-choose-online-chinese-course",
                title="海外家庭如何选择中文在线课程",
                excerpt="从时区、师资、反馈频率和测评体系四个角度快速判断。",
                cover_url="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80",
                content="选择课程时，先看孩子的目标，再看课程是否能持续提供反馈和成果记录。",
                author_name="HuaLearn 编辑部",
            ),
            BlogPost(
                slug="coding-in-chinese-for-bilingual-kids",
                title="用中文学编程，对双语孩子有什么帮助",
                excerpt="编程课不仅是技术训练，也能增强抽象表达和中文学术词汇。",
                cover_url="https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1200&q=80",
                content="双语编程学习能让学生在逻辑表达、项目协作和中文术语之间建立连接。",
                author_name="周景行",
            ),
        ]
    )

    remove_legacy_demo_courses(db)
    db.commit()


def ensure_question_bank_details(db: Session) -> None:
    questions = list(db.scalars(select(Question).order_by(Question.id)))
    if not questions:
        return

    for question in questions:
        has_options = db.scalar(
            select(QuestionOption.id).where(QuestionOption.question_id == question.id).limit(1)
        )
        has_media = db.scalar(
            select(QuestionMedia.id).where(QuestionMedia.question_id == question.id).limit(1)
        )
        if question.type == QuestionType.single_choice:
            if not has_options:
                db.add_all(
                    [
                        QuestionOption(
                            question_id=question.id,
                            label="A",
                            text="人物成长",
                            is_correct=True,
                            position=1,
                        ),
                        QuestionOption(
                            question_id=question.id,
                            label="B",
                            text="时间顺序",
                            is_correct=False,
                            position=2,
                        ),
                        QuestionOption(
                            question_id=question.id,
                            label="C",
                            text="地点变化",
                            is_correct=False,
                            position=3,
                        ),
                        QuestionOption(
                            question_id=question.id,
                            label="D",
                            text="修辞手法",
                            is_correct=False,
                            position=4,
                        ),
                    ]
                )
            if not has_media:
                db.add(
                    QuestionMedia(
                        question_id=question.id,
                        media_type="image",
                        title="阅读材料配图",
                        url="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
                        position=1,
                    )
                )
        elif question.type == QuestionType.coding and not has_media:
            db.add(
                QuestionMedia(
                    question_id=question.id,
                    media_type="handout",
                    title="代码题说明",
                    url="https://example.com/handouts/python-max-number.pdf",
                    position=1,
                )
            )
        elif question.type == QuestionType.pronunciation and not has_media:
            db.add(
                QuestionMedia(
                    question_id=question.id,
                    media_type="audio",
                    title="口语题示范音频",
                    url="https://example.com/audio/demo.wav",
                    position=1,
                )
            )

    db.commit()
