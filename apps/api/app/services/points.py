from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models import (
    CommunityAnswer,
    CommunityNoteShare,
    CommunityQuestion,
    Course,
    CourseChapter,
    Enrollment,
    LessonItemType,
    ProgressRecord,
    Submission,
    User,
    UserRole,
)
from app.schemas import StudentCoursePointBreakdown, StudentLeaderboardEntry, StudentPointEvent, StudentPointLevelOut


@dataclass(frozen=True)
class PointLevel:
    index: int
    name: str
    icon: str
    min_points: int


POINT_LEVELS: tuple[PointLevel, ...] = (
    PointLevel(1, "\u542f\u822a\u5b66\u5f92", "\u25c7", 0),
    PointLevel(2, "\u8def\u5f84\u63a2\u7d22\u8005", "\u25c8", 300),
    PointLevel(3, "\u4e13\u6ce8\u8bad\u7ec3\u5e08", "\u25c9", 800),
    PointLevel(4, "\u77e5\u8bc6\u9a91\u58eb", "\u25c6", 1500),
    PointLevel(5, "\u89e3\u9898\u5148\u950b", "\u2605", 2600),
    PointLevel(6, "\u5b66\u4e60\u9886\u822a\u5458", "\u2736", 4200),
    PointLevel(7, "\u667a\u6167\u5b88\u62a4\u8005", "\u2726", 6500),
    PointLevel(8, "\u661f\u8fb0\u5bfc\u5e08", "\u2727", 10000),
)


def aware_now() -> datetime:
    return datetime.now(timezone.utc)


def as_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def is_this_week(value: datetime | None, week_start: datetime) -> bool:
    timestamp = as_aware(value)
    return bool(timestamp and timestamp >= week_start)


def point_level_for_points(points: int) -> StudentPointLevelOut:
    current = POINT_LEVELS[0]
    next_level: PointLevel | None = None
    for index, level in enumerate(POINT_LEVELS):
        if points >= level.min_points:
            current = level
            next_level = POINT_LEVELS[index + 1] if index + 1 < len(POINT_LEVELS) else None
    next_points = next_level.min_points if next_level else None
    if next_points is None:
        progress = 100.0
    else:
        span = max(next_points - current.min_points, 1)
        progress = round((points - current.min_points) / span * 100, 1)
    return StudentPointLevelOut(
        index=current.index,
        name=current.name,
        icon=current.icon,
        min_points=current.min_points,
        next_level_points=next_points,
        progress_percent=min(max(progress, 0), 100),
    )


def speed_bonus(started_at: datetime | None, completed_at: datetime | None, max_bonus: int) -> int:
    start = as_aware(started_at)
    finish = as_aware(completed_at)
    if not start or not finish:
        return 0
    elapsed_days = max((finish - start).total_seconds() / 86400, 0)
    grace_days = 3
    return max(0, round(max_bonus - max(elapsed_days - grace_days, 0) * 2))


def lesson_activity_points(record: ProgressRecord) -> int:
    item_type = record.lesson_item.item_type if record.lesson_item else None
    base_by_type = {
        LessonItemType.video: 20,
        LessonItemType.handout: 14,
        LessonItemType.exercise: 10,
        LessonItemType.quiz: 12,
    }
    speed_by_type = {
        LessonItemType.video: 10,
        LessonItemType.handout: 8,
        LessonItemType.exercise: 6,
        LessonItemType.quiz: 8,
    }
    base = base_by_type.get(item_type, 8)
    return base + speed_bonus(record.enrollment.started_at, record.completed_at, speed_by_type.get(item_type, 6))


def latest_submissions(submissions: list[Submission]) -> list[Submission]:
    latest_by_key: dict[tuple[int | None, int | None, int], Submission] = {}
    for submission in submissions:
        key = (submission.enrollment_id, submission.lesson_item_id, submission.question_id)
        current = latest_by_key.get(key)
        current_time = as_aware(current.created_at) if current else None
        submission_time = as_aware(submission.created_at)
        if current is None or (submission_time and (current_time is None or submission_time > current_time)):
            latest_by_key[key] = submission
    return list(latest_by_key.values())


def submission_points(submission: Submission) -> int:
    if submission.score is None:
        return 0
    question_points = max(int(submission.question.points or 0), 1) if submission.question else 1
    score = max(float(submission.score or 0), 0)
    ratio = min(score / question_points, 1)
    return 2 + round(score * 3) + (8 if ratio >= 0.8 else 0) + (5 if ratio >= 0.999 else 0)


def build_point_event(
    *,
    label: str,
    source: str,
    points: int,
    occurred_at: datetime | None = None,
    course_title: str | None = None,
    detail: str | None = None,
) -> StudentPointEvent:
    return StudentPointEvent(
        label=label,
        source=source,
        points=points,
        occurred_at=occurred_at,
        course_title=course_title,
        detail=detail,
    )


def community_point_events(db: Session, user_id: int, week_start: datetime) -> tuple[int, int, list[StudentPointEvent]]:
    total_points = 0
    weekly_points = 0
    events: list[StudentPointEvent] = []

    for question in db.scalars(select(CommunityQuestion).where(CommunityQuestion.user_id == user_id)):
        points = 5
        total_points += points
        if is_this_week(question.created_at, week_start):
            weekly_points += points
        events.append(
            build_point_event(
                label="\u53d1\u5e03\u5b66\u4e60\u95ee\u9898",
                source="community_question",
                points=points,
                occurred_at=question.created_at,
                course_title=question.course.title if question.course else None,
                detail=question.title,
            )
        )

    for answer in db.scalars(select(CommunityAnswer).where(CommunityAnswer.user_id == user_id)):
        likes = int(answer.likes_count or 0)
        points = 10 + likes * 4 + (20 if answer.is_best else 0)
        total_points += points
        if is_this_week(answer.created_at, week_start):
            weekly_points += points
        best_text = "\uff0c\u88ab\u91c7\u7eb3\u4e3a\u6700\u4f73\u7b54\u6848" if answer.is_best else ""
        events.append(
            build_point_event(
                label="\u56de\u7b54\u540c\u5b66\u95ee\u9898",
                source="community_answer",
                points=points,
                occurred_at=answer.created_at,
                detail=f"\u56de\u7b54\u88ab\u70b9\u8d5e {likes} \u6b21{best_text}",
            )
        )

    for note in db.scalars(select(CommunityNoteShare).where(CommunityNoteShare.user_id == user_id)):
        likes = int(note.likes_count or 0)
        points = 8 + likes * 4
        total_points += points
        if is_this_week(note.created_at, week_start):
            weekly_points += points
        events.append(
            build_point_event(
                label="\u5206\u4eab\u5b66\u4e60\u7b14\u8bb0",
                source="community_note",
                points=points,
                occurred_at=note.created_at,
                course_title=note.course.title if note.course else None,
                detail=f"{note.title} · \u83b7\u5f97 {likes} \u4e2a\u8d5e",
            )
        )

    return total_points, weekly_points, events


def student_achievements(
    *,
    total_points: int,
    weekly_points: int,
    enrollments: list[Enrollment],
    community_points: int,
    latest_assessment_points: int,
) -> list[str]:
    achievements: list[str] = []
    if enrollments:
        achievements.append("\u5df2\u5f00\u542f\u4e2a\u4eba\u5b66\u4e60\u65c5\u7a0b")
    if any(float(enrollment.progress_percent or 0) >= 50 for enrollment in enrollments):
        achievements.append("\u8bfe\u7a0b\u8fdb\u5ea6\u7a81\u7834 50%")
    if any(enrollment.status == "completed" for enrollment in enrollments):
        achievements.append("\u5b8c\u6210\u4e00\u95e8\u8bfe\u7a0b")
    if latest_assessment_points > 0:
        achievements.append("\u5b8c\u6210\u9898\u5e93\u7ec3\u4e60")
    if community_points >= 50:
        achievements.append("\u793e\u533a\u4e92\u52a9\u8fbe\u4eba")
    if weekly_points >= 100:
        achievements.append("\u672c\u5468\u5b66\u4e60\u51b2\u523a")
    if total_points >= 800:
        achievements.append("\u8fdb\u5165\u8fdb\u9636\u5b66\u4e60\u8005\u884c\u5217")
    if not achievements:
        achievements.append("\u51c6\u5907\u5f00\u59cb\u5b66\u4e60")
    return achievements


def calculate_student_point_detail(db: Session, student: User, week_start: datetime | None = None) -> dict:
    week_start = as_aware(week_start) or aware_now() - timedelta(days=7)
    enrollments = list(student.enrollments)
    submissions = latest_submissions(list(student.submissions))
    submissions_by_enrollment: dict[int | None, list[Submission]] = {}
    for submission in submissions:
        submissions_by_enrollment.setdefault(submission.enrollment_id, []).append(submission)

    total_points = 0
    weekly_points = 0
    course_breakdown: list[StudentCoursePointBreakdown] = []
    recent_events: list[StudentPointEvent] = []
    handled_submission_ids: set[int] = set()
    latest_assessment_points = 0

    for enrollment in enrollments:
        course = enrollment.course
        progress_points = round(float(enrollment.progress_percent or 0) * 0.6)
        activity_points = 0
        assessment_points = 0
        completion_bonus = 180 + speed_bonus(enrollment.started_at, enrollment.updated_at, 120) if enrollment.status == "completed" else 0

        if progress_points:
            recent_events.append(
                build_point_event(
                    label="\u8bfe\u7a0b\u8fdb\u5ea6\u6210\u957f",
                    source="progress",
                    points=progress_points,
                    occurred_at=enrollment.updated_at,
                    course_title=course.title if course else None,
                    detail=f"\u5f53\u524d\u8fdb\u5ea6 {round(float(enrollment.progress_percent or 0), 1)}%",
                )
            )

        if completion_bonus:
            recent_events.append(
                build_point_event(
                    label="\u5b8c\u6210\u6574\u95e8\u8bfe\u7a0b",
                    source="completion",
                    points=completion_bonus,
                    occurred_at=enrollment.updated_at,
                    course_title=course.title if course else None,
                    detail="\u5305\u542b\u8bfe\u7a0b\u5b8c\u6210\u5956\u52b1\u548c\u901f\u5ea6\u5956\u52b1",
                )
            )

        for record in enrollment.progress_records:
            if not record.completed_at:
                continue
            points = lesson_activity_points(record)
            activity_points += points
            if is_this_week(record.completed_at, week_start):
                weekly_points += points
            item = record.lesson_item
            item_title = item.title if item else "\u5b66\u4e60\u9879\u76ee"
            recent_events.append(
                build_point_event(
                    label=f"\u5b8c\u6210{item_title}",
                    source=item.item_type.value if item else "lesson",
                    points=points,
                    occurred_at=record.completed_at,
                    course_title=course.title if course else None,
                    detail="\u5305\u542b\u57fa\u7840\u5b66\u4e60\u5206\u548c\u901f\u5ea6\u5956\u52b1",
                )
            )

        for submission in submissions_by_enrollment.get(enrollment.id, []):
            handled_submission_ids.add(submission.id)
            points = submission_points(submission)
            if not points:
                continue
            assessment_points += points
            latest_assessment_points += points
            if is_this_week(submission.created_at, week_start):
                weekly_points += points
            question_title = submission.question.prompt if submission.question else "\u9898\u76ee\u7ec3\u4e60"
            score = round(float(submission.score or 0), 1)
            max_score = int(submission.question.points or 0) if submission.question else 0
            recent_events.append(
                build_point_event(
                    label="\u5b8c\u6210\u7ec3\u4e60/\u6d4b\u9a8c\u9898",
                    source="assessment",
                    points=points,
                    occurred_at=submission.created_at,
                    course_title=course.title if course else None,
                    detail=f"{question_title[:80]} · \u5f97\u5206 {score}/{max_score}",
                )
            )

        course_total = progress_points + activity_points + assessment_points + completion_bonus
        total_points += course_total
        if course:
            course_breakdown.append(
                StudentCoursePointBreakdown(
                    course_id=course.id,
                    course_slug=course.slug,
                    course_title=course.title,
                    status=enrollment.status,
                    progress_percent=round(float(enrollment.progress_percent or 0), 1),
                    progress_points=progress_points,
                    activity_points=activity_points,
                    assessment_points=assessment_points,
                    completion_bonus=completion_bonus,
                    total_points=course_total,
                )
            )

    for submission in submissions:
        if submission.id in handled_submission_ids:
            continue
        points = submission_points(submission)
        if not points:
            continue
        total_points += points
        latest_assessment_points += points
        if is_this_week(submission.created_at, week_start):
            weekly_points += points
        question_title = submission.question.prompt if submission.question else "\u9898\u5e93\u7ec3\u4e60"
        recent_events.append(
            build_point_event(
                label="\u5b8c\u6210\u9898\u5e93\u7ec3\u4e60",
                source="assessment",
                points=points,
                occurred_at=submission.created_at,
                detail=question_title[:80],
            )
        )

    community_points, community_weekly_points, community_events = community_point_events(db, student.id, week_start)
    total_points += community_points
    weekly_points += community_weekly_points
    recent_events.extend(community_events)

    recent_events.sort(key=lambda event: as_aware(event.occurred_at).timestamp() if as_aware(event.occurred_at) else 0, reverse=True)
    course_breakdown.sort(key=lambda item: item.total_points, reverse=True)
    return {
        "total_points": int(total_points),
        "weekly_points": int(weekly_points),
        "community_points": int(community_points),
        "level": point_level_for_points(int(total_points)),
        "achievements": student_achievements(
            total_points=int(total_points),
            weekly_points=int(weekly_points),
            enrollments=enrollments,
            community_points=int(community_points),
            latest_assessment_points=int(latest_assessment_points),
        ),
        "course_breakdown": course_breakdown,
        "recent_events": recent_events[:18],
    }


def build_leaderboard_entry(*, rank: int, user: User, detail: dict, enrollments: list[Enrollment]) -> StudentLeaderboardEntry:
    active_courses = len([enrollment for enrollment in enrollments if enrollment.status != "completed"])
    completed_courses = len([enrollment for enrollment in enrollments if enrollment.status == "completed"])
    average_progress = round(sum(float(enrollment.progress_percent or 0) for enrollment in enrollments) / len(enrollments), 1) if enrollments else 0
    return StudentLeaderboardEntry(
        rank=rank,
        student_id=user.id,
        student_name=user.full_name,
        avatar_url=user.avatar_url,
        total_points=int(detail["total_points"]),
        weekly_points=int(detail["weekly_points"]),
        completed_courses=completed_courses,
        active_courses=active_courses,
        average_progress=average_progress,
        level=detail["level"],
    )


def student_point_load_options():
    return (
        selectinload(User.enrollments)
        .joinedload(Enrollment.course)
        .selectinload(Course.chapters)
        .selectinload(CourseChapter.items),
        selectinload(User.enrollments)
        .selectinload(Enrollment.progress_records)
        .joinedload(ProgressRecord.lesson_item),
        selectinload(User.submissions).joinedload(Submission.question),
    )


def load_student_with_point_data(db: Session, user_id: int) -> User | None:
    return db.scalar(
        select(User)
        .where(User.id == user_id, User.role == UserRole.student, User.is_active.is_(True))
        .options(*student_point_load_options())
    )


def load_students_with_point_data(db: Session) -> list[User]:
    return list(
        db.scalars(
            select(User)
            .where(User.role == UserRole.student, User.is_active.is_(True))
            .options(*student_point_load_options())
            .order_by(User.full_name)
        )
    )


def leaderboard_rows(db: Session) -> list[tuple[User, dict, StudentLeaderboardEntry]]:
    week_start = aware_now() - timedelta(days=7)
    rows: list[tuple[User, dict, StudentLeaderboardEntry]] = []
    for student in load_students_with_point_data(db):
        detail = calculate_student_point_detail(db, student, week_start)
        enrollments = list(student.enrollments)
        if detail["total_points"] > 0 or enrollments:
            rows.append((student, detail, build_leaderboard_entry(rank=0, user=student, detail=detail, enrollments=enrollments)))
    return rows
