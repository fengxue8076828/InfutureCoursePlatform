from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models import (
    ChapterNote,
    CommunityAnswer,
    CommunityNoteShare,
    CommunityQuestion,
    CommunityReaction,
    CompetitionSubmission,
    Course,
    CourseChapter,
    Enrollment,
    ExamPaperKind,
    ExamPaperSubmission,
    LessonItemType,
    ProgressRecord,
    StudentFollow,
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

PASSING_RATIO = 0.8
NOTE_POINTS = 6
NOTE_LIKE_POINTS = 3
FOLLOWER_POINTS = 10


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


def question_max_points(submission: Submission) -> int:
    return max(int(submission.question.points or 0), 1) if submission.question else 1


def submission_score_ratio(submission: Submission) -> float:
    if submission.score is None:
        return 0.0
    question_points = question_max_points(submission)
    score = max(float(submission.score or 0), 0)
    return min(score / question_points, 1)


def assessment_points_from_attempts(submissions: list[Submission]) -> tuple[int, Submission | None, int, float]:
    graded_submissions = sorted(
        [submission for submission in submissions if submission.score is not None],
        key=lambda submission: as_aware(submission.created_at) or datetime.min.replace(tzinfo=timezone.utc),
    )
    for attempt_number, submission in enumerate(graded_submissions, start=1):
        ratio = submission_score_ratio(submission)
        if ratio < PASSING_RATIO:
            continue
        if attempt_number >= 3:
            return 0, submission, attempt_number, ratio
        multiplier = 1.0 if attempt_number == 1 else 0.5
        points = round(question_max_points(submission) * 5 * ratio * multiplier)
        return max(points, 1), submission, attempt_number, ratio
    latest_submission = graded_submissions[-1] if graded_submissions else None
    latest_ratio = submission_score_ratio(latest_submission) if latest_submission else 0.0
    return 0, latest_submission, len(graded_submissions), latest_ratio


def grouped_submissions(submissions: list[Submission]) -> dict[tuple[int | None, int | None, int], list[Submission]]:
    groups: dict[tuple[int | None, int | None, int], list[Submission]] = {}
    for submission in submissions:
        key = (submission.enrollment_id, submission.lesson_item_id, submission.question_id)
        groups.setdefault(key, []).append(submission)
    return groups


def submission_points(submission: Submission) -> int:
    points, _, _, _ = assessment_points_from_attempts([submission])
    return points


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


def reaction_count(db: Session, target_type: str, target_id: int, since: datetime | None = None) -> int:
    stmt = select(CommunityReaction).where(
        CommunityReaction.target_type == target_type,
        CommunityReaction.target_id == target_id,
    )
    if since is not None:
        stmt = stmt.where(CommunityReaction.created_at >= since)
    return len(list(db.scalars(stmt)))


def community_point_events(db: Session, user_id: int, week_start: datetime) -> tuple[int, int, list[StudentPointEvent]]:
    total_points = 0
    weekly_points = 0
    events: list[StudentPointEvent] = []

    for question in db.scalars(select(CommunityQuestion).where(CommunityQuestion.user_id == user_id)):
        likes = reaction_count(db, "question", question.id)
        weekly_likes = reaction_count(db, "question", question.id, week_start)
        points = 6 + likes * 3
        total_points += points
        if is_this_week(question.created_at, week_start):
            weekly_points += 6
        weekly_points += weekly_likes * 3
        events.append(
            build_point_event(
                label="\u53d1\u5e03\u5b66\u4e60\u95ee\u9898",
                source="community_question",
                points=points,
                occurred_at=question.created_at,
                course_title=question.course.title if question.course else None,
                detail=f"{question.title} · 被点赞 {likes} 次",
            )
        )

    for answer in db.scalars(select(CommunityAnswer).where(CommunityAnswer.user_id == user_id)):
        likes = int(answer.likes_count or 0)
        weekly_likes = reaction_count(db, "answer", answer.id, week_start)
        points = 10 + likes * 4 + (20 if answer.is_best else 0)
        total_points += points
        if is_this_week(answer.created_at, week_start):
            weekly_points += 10 + (20 if answer.is_best else 0)
        weekly_points += weekly_likes * 4
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
        weekly_likes = reaction_count(db, "note", note.id, week_start)
        points = 8 + likes * 3
        total_points += points
        if is_this_week(note.created_at, week_start):
            weekly_points += 8
        weekly_points += weekly_likes * 3
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


def course_note_point_events(
    db: Session,
    *,
    user_id: int,
    enrollment: Enrollment,
    course_title: str | None,
    week_start: datetime,
) -> tuple[int, int, list[StudentPointEvent]]:
    notes = [
        note
        for note in db.scalars(
            select(ChapterNote).where(
                ChapterNote.user_id == user_id,
                ChapterNote.enrollment_id == enrollment.id,
            )
        )
        if (note.content or "").strip()
    ]
    if not notes:
        return 0, 0, []

    total_points = 0
    weekly_points = 0
    events: list[StudentPointEvent] = []
    note_ids = [note.id for note in notes]

    for note in notes:
        total_points += NOTE_POINTS
        if is_this_week(note.updated_at or note.created_at, week_start):
            weekly_points += NOTE_POINTS

    note_shares = list(
        db.scalars(
            select(CommunityNoteShare).where(
                CommunityNoteShare.chapter_note_id.in_(note_ids),
                CommunityNoteShare.user_id == user_id,
            )
        )
    )
    likes = sum(int(share.likes_count or 0) for share in note_shares)
    like_points = likes * NOTE_LIKE_POINTS
    total_points += like_points
    for share in note_shares:
        if is_this_week(share.updated_at or share.created_at, week_start):
            weekly_points += int(share.likes_count or 0) * NOTE_LIKE_POINTS

    latest_time = max((as_aware(note.updated_at or note.created_at) for note in notes), default=None)
    events.append(
        build_point_event(
            label="整理课程笔记",
            source="course_note",
            points=total_points,
            occurred_at=latest_time,
            course_title=course_title,
            detail=f"{len(notes)} 篇笔记 · 获得 {likes} 个赞",
        )
    )
    return total_points, weekly_points, events


def exam_submission_point_events(
    submissions: list[ExamPaperSubmission],
    week_start: datetime,
) -> tuple[int, int, list[StudentPointEvent]]:
    best_by_paper: dict[int, ExamPaperSubmission] = {}
    for submission in submissions:
        if not submission.paper:
            continue
        total_score = max(float(submission.total_score or 0), 0)
        if total_score <= 0:
            continue
        ratio = min(max(float(submission.score or 0), 0) / total_score, 1)
        current = best_by_paper.get(submission.paper_id)
        current_total = max(float(current.total_score or 0), 0) if current else 0
        current_ratio = (
            min(max(float(current.score or 0), 0) / current_total, 1)
            if current and current_total > 0
            else -1
        )
        if current is None or ratio > current_ratio:
            best_by_paper[submission.paper_id] = submission

    total_points = 0
    weekly_points = 0
    events: list[StudentPointEvent] = []
    for submission in best_by_paper.values():
        paper = submission.paper
        total_score = max(float(submission.total_score or 0), 1)
        ratio = min(max(float(submission.score or 0), 0) / total_score, 1)
        is_competition = paper.kind == ExamPaperKind.competition
        base_points = 30 if is_competition else 15
        score_points = round((100 if is_competition else 60) * ratio)
        pass_bonus = 30 if is_competition and ratio >= PASSING_RATIO else 15 if ratio >= PASSING_RATIO else 0
        excellence_bonus = 20 if is_competition and ratio >= 0.95 else 0
        points = base_points + score_points + pass_bonus + excellence_bonus
        total_points += points
        if is_this_week(submission.submitted_at, week_start):
            weekly_points += points
        events.append(
            build_point_event(
                label="完成竞赛试卷" if is_competition else "完成模拟考试",
                source="competition" if is_competition else "mock_exam",
                points=points,
                occurred_at=submission.submitted_at,
                detail=f"{paper.title} · 得分率 {round(ratio * 100, 1)}%",
            )
        )
    return total_points, weekly_points, events


def competition_submission_point_events(
    submissions: list[CompetitionSubmission],
    week_start: datetime,
) -> tuple[int, int, list[StudentPointEvent]]:
    best_by_competition: dict[int, CompetitionSubmission] = {}
    for submission in submissions:
        if not submission.competition:
            continue
        total_score = max(float(submission.total_score or 0), 0)
        if total_score <= 0:
            continue
        ratio = min(max(float(submission.score or 0), 0) / total_score, 1)
        current = best_by_competition.get(submission.competition_id)
        current_total = max(float(current.total_score or 0), 0) if current else 0
        current_ratio = (
            min(max(float(current.score or 0), 0) / current_total, 1)
            if current and current_total > 0
            else -1
        )
        if current is None or ratio > current_ratio:
            best_by_competition[submission.competition_id] = submission

    total_points = 0
    weekly_points = 0
    events: list[StudentPointEvent] = []
    for submission in best_by_competition.values():
        competition = submission.competition
        total_score = max(float(submission.total_score or 0), 1)
        ratio = min(max(float(submission.score or 0), 0) / total_score, 1)
        points = 30 + round(100 * ratio) + (30 if ratio >= PASSING_RATIO else 0) + (20 if ratio >= 0.95 else 0)
        total_points += points
        if is_this_week(submission.submitted_at, week_start):
            weekly_points += points
        events.append(
            build_point_event(
                label="\u5b8c\u6210\u7ade\u8d5b\u8bd5\u5377",
                source="competition",
                points=points,
                occurred_at=submission.submitted_at,
                detail=f"{competition.title} \u00b7 \u5f97\u5206\u7387 {round(ratio * 100, 1)}%",
            )
        )
    return total_points, weekly_points, events


def follower_point_events(db: Session, user_id: int, week_start: datetime) -> tuple[int, int, int, list[StudentPointEvent]]:
    follows = list(
        db.scalars(
            select(StudentFollow)
            .join(User, User.id == StudentFollow.follower_id)
            .where(
                StudentFollow.followee_id == user_id,
                User.role == UserRole.student,
                User.is_active.is_(True),
            )
        )
    )
    followers_count = len(follows)
    total_points = followers_count * FOLLOWER_POINTS
    weekly_points = len([follow for follow in follows if is_this_week(follow.created_at, week_start)]) * FOLLOWER_POINTS
    latest_time = max((as_aware(follow.created_at) for follow in follows), default=None)
    events = [
        build_point_event(
            label="被同学关注",
            source="followers",
            points=total_points,
            occurred_at=latest_time,
            detail=f"{followers_count} 位同学关注了你",
        )
    ] if followers_count else []
    return followers_count, total_points, weekly_points, events


def calculate_student_point_detail(db: Session, student: User, week_start: datetime | None = None) -> dict:
    week_start = as_aware(week_start) or aware_now() - timedelta(days=7)
    enrollments = list(student.enrollments)
    submissions = list(student.submissions)
    submission_groups = grouped_submissions(submissions)

    total_points = 0
    weekly_points = 0
    course_points_total = 0
    course_breakdown: list[StudentCoursePointBreakdown] = []
    recent_events: list[StudentPointEvent] = []
    handled_submission_ids: set[int] = set()
    latest_assessment_points = 0

    for enrollment in enrollments:
        course = enrollment.course
        progress_points = 0
        activity_points = 0
        assessment_points = 0
        completion_bonus = 180 + speed_bonus(enrollment.started_at, enrollment.updated_at, 120) if enrollment.status == "completed" else 0

        if completion_bonus:
            if is_this_week(enrollment.updated_at, week_start):
                weekly_points += completion_bonus
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

        for key, group in submission_groups.items():
            if key[0] != enrollment.id:
                continue
            handled_submission_ids.update(submission.id for submission in group)
            points, passing_submission, attempt_number, ratio = assessment_points_from_attempts(group)
            if not points:
                continue
            assessment_points += points
            latest_assessment_points += points
            if passing_submission and is_this_week(passing_submission.created_at, week_start):
                weekly_points += points
            question_title = passing_submission.question.prompt if passing_submission and passing_submission.question else "\u9898\u76ee\u7ec3\u4e60"
            recent_events.append(
                build_point_event(
                    label="\u5b8c\u6210\u7ec3\u4e60/\u6d4b\u9a8c\u9898",
                    source="assessment",
                    points=points,
                    occurred_at=passing_submission.created_at if passing_submission else None,
                    course_title=course.title if course else None,
                    detail=f"{question_title[:80]} · 第 {attempt_number} 次通过 · 得分率 {round(ratio * 100, 1)}%",
                )
            )

        note_points, note_weekly_points, note_events = course_note_point_events(
            db,
            user_id=student.id,
            enrollment=enrollment,
            course_title=course.title if course else None,
            week_start=week_start,
        )
        weekly_points += note_weekly_points
        recent_events.extend(note_events)

        course_total = assessment_points + completion_bonus + note_points
        course_points_total += course_total
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
                    note_points=note_points,
                    completion_bonus=completion_bonus,
                    total_points=course_total,
                )
            )

    for key, group in submission_groups.items():
        if any(submission.id in handled_submission_ids for submission in group):
            continue
        points, passing_submission, attempt_number, ratio = assessment_points_from_attempts(group)
        if not points:
            continue
        total_points += points
        latest_assessment_points += points
        if passing_submission and is_this_week(passing_submission.created_at, week_start):
            weekly_points += points
        question_title = passing_submission.question.prompt if passing_submission and passing_submission.question else "\u9898\u5e93\u7ec3\u4e60"
        recent_events.append(
            build_point_event(
                label="\u5b8c\u6210\u9898\u5e93\u7ec3\u4e60",
                source="assessment",
                points=points,
                occurred_at=passing_submission.created_at if passing_submission else None,
                detail=f"{question_title[:80]} · 第 {attempt_number} 次通过 · 得分率 {round(ratio * 100, 1)}%",
            )
        )

    community_points, community_weekly_points, community_events = community_point_events(db, student.id, week_start)
    total_points += community_points
    weekly_points += community_weekly_points
    recent_events.extend(community_events)

    mock_exam_points, mock_exam_weekly_points, mock_exam_events = exam_submission_point_events(
        list(student.exam_submissions),
        week_start,
    )
    competition_points, competition_weekly_points, competition_events = competition_submission_point_events(
        list(student.competition_submissions),
        week_start,
    )
    competition_points += mock_exam_points
    competition_weekly_points += mock_exam_weekly_points
    competition_events = mock_exam_events + competition_events
    total_points += competition_points
    weekly_points += competition_weekly_points
    recent_events.extend(competition_events)

    followers_count, follower_points, follower_weekly_points, follower_events = follower_point_events(db, student.id, week_start)
    total_points += follower_points
    weekly_points += follower_weekly_points
    recent_events.extend(follower_events)

    recent_events.sort(key=lambda event: as_aware(event.occurred_at).timestamp() if as_aware(event.occurred_at) else 0, reverse=True)
    course_breakdown.sort(key=lambda item: item.total_points, reverse=True)
    return {
        "total_points": int(total_points),
        "weekly_points": int(weekly_points),
        "course_points": int(course_points_total),
        "community_points": int(community_points),
        "competition_points": int(competition_points),
        "follower_points": int(follower_points),
        "followers_count": int(followers_count),
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
        course_points=int(detail.get("course_points", 0)),
        community_points=int(detail.get("community_points", 0)),
        competition_points=int(detail.get("competition_points", 0)),
        follower_points=int(detail.get("follower_points", 0)),
        followers_count=int(detail.get("followers_count", 0)),
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
        selectinload(User.exam_submissions).joinedload(ExamPaperSubmission.paper),
        selectinload(User.competition_submissions).joinedload(CompetitionSubmission.competition),
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
