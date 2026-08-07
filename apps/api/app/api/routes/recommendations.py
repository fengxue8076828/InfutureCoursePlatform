from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Any, Iterable

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.models import (
    ActivityRegistration,
    ActivityRegistrationStatus,
    Competition,
    Course,
    CourseReview,
    CourseStatus,
    Enrollment,
    ExamPaper,
    ExamPaperKind,
    ExamPaperStatus,
    Institution,
    InstitutionActivity,
    LearningPath,
    LearningPathStatus,
    Question,
    QuestionStatus,
    StudentFollow,
    Submission,
    Teacher,
    User,
    UserRole,
)

router = APIRouter(prefix="/recommendations", tags=["recommendations"])

RESOURCE_KEYS = (
    "courses",
    "learning_paths",
    "teachers",
    "activities",
    "questions",
    "mock_exams",
    "competitions",
    "students",
    "institutions",
)


def _enum_value(value: Any) -> Any:
    return getattr(value, "value", value)


def _top(values: Iterable[Any], limit: int = 8) -> list[dict[str, Any]]:
    counter = Counter(str(value) for value in values if value not in (None, ""))
    return [{"value": value, "count": count} for value, count in counter.most_common(limit)]


def _list_match_score(value: Any, ranked_values: list[dict[str, Any]], weight: float) -> float:
    if value in (None, ""):
        return 0.0
    value_str = str(value)
    for index, item in enumerate(ranked_values):
        if item.get("value") == value_str:
            return weight / (index + 1)
    return 0.0


def _build_student_profile(db: Session, user: User) -> dict[str, Any]:
    enrollments = db.scalars(select(Enrollment).where(Enrollment.user_id == user.id)).all()
    enrolled_course_ids = [enrollment.course_id for enrollment in enrollments]
    enrolled_courses = (
        db.scalars(select(Course).where(Course.id.in_(enrolled_course_ids))).all()
        if enrolled_course_ids
        else []
    )

    submitted_question_ids = db.scalars(select(Submission.question_id).where(Submission.user_id == user.id)).all()
    submitted_questions = (
        db.scalars(select(Question).where(Question.id.in_(submitted_question_ids))).all()
        if submitted_question_ids
        else []
    )
    followed_student_ids = db.scalars(
        select(StudentFollow.followee_id).where(StudentFollow.follower_id == user.id)
    ).all()

    return {
        "student_id": user.id,
        "enrolled_course_ids": enrolled_course_ids,
        "completed_course_ids": [
            enrollment.course_id
            for enrollment in enrollments
            if enrollment.completed_at or enrollment.status == "completed"
        ],
        "course_categories": _top(course.category for course in enrolled_courses),
        "levels": _top([course.level for course in enrolled_courses] + [question.difficulty for question in submitted_questions]),
        "institution_ids": _top(
            [course.institution_id for course in enrolled_courses]
            + [question.institution_id for question in submitted_questions]
        ),
        "teacher_ids": _top(course.teacher_id for course in enrolled_courses),
        "question_types": _top(_enum_value(question.type) for question in submitted_questions),
        "skill_areas": _top(question.skill_area for question in submitted_questions),
        "followed_student_ids": followed_student_ids[:20],
    }


def _review_stats(db: Session) -> dict[int, dict[str, float]]:
    rows = db.execute(
        select(CourseReview.course_id, func.avg(CourseReview.rating), func.count(CourseReview.id)).group_by(
            CourseReview.course_id
        )
    ).all()
    return {
        int(course_id): {"rating": float(avg_rating or 0), "reviews_count": float(review_count or 0)}
        for course_id, avg_rating, review_count in rows
    }


def _activity_registration_counts(db: Session) -> dict[int, int]:
    rows = db.execute(
        select(ActivityRegistration.activity_id, func.count(ActivityRegistration.id)).group_by(
            ActivityRegistration.activity_id
        )
    ).all()
    return {int(activity_id): int(count or 0) for activity_id, count in rows}


def _follower_counts(db: Session) -> dict[int, int]:
    rows = db.execute(
        select(StudentFollow.followee_id, func.count(StudentFollow.follower_id)).group_by(StudentFollow.followee_id)
    ).all()
    return {int(followee_id): int(count or 0) for followee_id, count in rows}


def _build_candidates(db: Session) -> dict[str, list[dict[str, Any]]]:
    reviews = _review_stats(db)
    activity_counts = _activity_registration_counts(db)
    follower_counts = _follower_counts(db)

    courses = db.scalars(
        select(Course).where(Course.status == CourseStatus.published).order_by(Course.updated_at.desc()).limit(300)
    ).all()
    learning_paths = db.scalars(
        select(LearningPath)
        .where(LearningPath.status == LearningPathStatus.published)
        .order_by(LearningPath.updated_at.desc())
        .limit(200)
    ).all()
    teachers = db.scalars(select(Teacher).order_by(Teacher.updated_at.desc()).limit(200)).all()
    activities = db.scalars(
        select(InstitutionActivity)
        .where(InstitutionActivity.registration_status == ActivityRegistrationStatus.open)
        .order_by(InstitutionActivity.starts_at.asc())
        .limit(200)
    ).all()
    questions = db.scalars(
        select(Question)
        .where(Question.status == QuestionStatus.published, Question.is_public.is_(True))
        .order_by(Question.updated_at.desc())
        .limit(300)
    ).all()
    mock_exams = db.scalars(
        select(ExamPaper)
        .where(ExamPaper.kind == ExamPaperKind.mock_exam, ExamPaper.status == ExamPaperStatus.published)
        .order_by(ExamPaper.updated_at.desc())
        .limit(200)
    ).all()
    competitions = db.scalars(
        select(Competition)
        .where(Competition.status == ExamPaperStatus.published)
        .order_by(Competition.starts_at.asc().nullslast(), Competition.updated_at.desc())
        .limit(200)
    ).all()
    students = db.scalars(
        select(User)
        .where(User.role == UserRole.student, User.is_active.is_(True))
        .order_by(User.updated_at.desc())
        .limit(300)
    ).all()
    institutions = db.scalars(select(Institution).order_by(Institution.updated_at.desc()).limit(200)).all()

    return {
        "courses": [
            {
                "id": course.id,
                "category": course.category,
                "level": course.level,
                "institution_id": course.institution_id,
                "teacher_id": course.teacher_id,
                "popularity": course.students_count or 0,
                "quality": reviews.get(course.id, {}).get("rating", 0),
                "reviews_count": reviews.get(course.id, {}).get("reviews_count", 0),
            }
            for course in courses
        ],
        "learning_paths": [
            {
                "id": path.id,
                "level": path.level,
                "institution_id": path.institution_id,
                "course_count": len(path.course_links),
                "popularity": len(path.course_links),
            }
            for path in learning_paths
        ],
        "teachers": [
            {
                "id": teacher.id,
                "institution_id": teacher.institution_id,
                "specialties": teacher.specialties or [],
                "course_count": len(teacher.courses),
                "popularity": len(teacher.courses),
            }
            for teacher in teachers
        ],
        "activities": [
            {
                "id": activity.id,
                "institution_id": activity.institution_id,
                "teacher_id": activity.teacher_id,
                "mode": _enum_value(activity.mode),
                "audience": activity.audience or "",
                "popularity": activity_counts.get(activity.id, 0),
                "starts_at": activity.starts_at.isoformat() if activity.starts_at else None,
            }
            for activity in activities
        ],
        "questions": [
            {
                "id": question.id,
                "institution_id": question.institution_id,
                "creator_id": question.created_by_user_id,
                "type": _enum_value(question.type),
                "difficulty": question.difficulty,
                "skill_area": question.skill_area,
                "points": question.points,
                "requires_manual_grading": question.requires_manual_grading,
            }
            for question in questions
        ],
        "mock_exams": [
            {
                "id": paper.id,
                "institution_id": paper.institution_id,
                "category_id": paper.category_id,
                "duration_minutes": paper.duration_minutes,
                "source_type": _enum_value(paper.source_type),
                "question_count": len(paper.question_links),
                "popularity": len(paper.submissions),
            }
            for paper in mock_exams
        ],
        "competitions": [
            {
                "id": competition.id,
                "institution_id": competition.institution_id,
                "category_id": competition.category_id,
                "difficulty": competition.difficulty,
                "duration_minutes": competition.duration_minutes,
                "question_count": len(competition.question_links),
                "popularity": len(competition.registrations),
            }
            for competition in competitions
        ],
        "students": [
            {
                "id": student.id,
                "region": student.region or "",
                "popularity": follower_counts.get(student.id, 0),
            }
            for student in students
        ],
        "institutions": [
            {
                "id": institution.id,
                "category": institution.category,
                "region": institution.region or "",
                "type": institution.institution_type,
                "popularity": len(institution.courses),
            }
            for institution in institutions
        ],
    }


def _recommendation_orders(profile: dict[str, Any], candidates: dict[str, list[dict[str, Any]]], limit: int) -> dict[str, list[int]]:
    enrolled_ids = set(profile.get("enrolled_course_ids", []))
    completed_ids = set(profile.get("completed_course_ids", []))

    def score_course(item: dict[str, Any]) -> float:
        score = 0.0
        score += _list_match_score(item.get("category"), profile.get("course_categories", []), 45)
        score += _list_match_score(item.get("level"), profile.get("levels", []), 30)
        score += _list_match_score(item.get("institution_id"), profile.get("institution_ids", []), 20)
        score += _list_match_score(item.get("teacher_id"), profile.get("teacher_ids", []), 14)
        score += float(item.get("quality") or 0) * 8
        score += min(float(item.get("popularity") or 0), 500) * 0.03
        if item["id"] in completed_ids:
            score -= 120
        elif item["id"] in enrolled_ids:
            score -= 70
        return score

    def score_by_common_features(item: dict[str, Any]) -> float:
        score = 0.0
        score += _list_match_score(item.get("institution_id"), profile.get("institution_ids", []), 22)
        score += _list_match_score(item.get("teacher_id"), profile.get("teacher_ids", []), 15)
        score += _list_match_score(item.get("level") or item.get("difficulty"), profile.get("levels", []), 18)
        score += _list_match_score(item.get("skill_area"), profile.get("skill_areas", []), 25)
        score += _list_match_score(item.get("type"), profile.get("question_types", []), 12)
        score += min(float(item.get("popularity") or item.get("course_count") or item.get("question_count") or 0), 500) * 0.08
        return score

    scorers = {
        "courses": score_course,
        "learning_paths": score_by_common_features,
        "teachers": score_by_common_features,
        "activities": score_by_common_features,
        "questions": score_by_common_features,
        "mock_exams": score_by_common_features,
        "competitions": score_by_common_features,
        "students": score_by_common_features,
        "institutions": score_by_common_features,
    }

    orders: dict[str, list[int]] = {}
    for key in RESOURCE_KEYS:
        scorer = scorers[key]
        ranked = sorted(
            candidates.get(key, []),
            key=lambda item: (scorer(item), float(item.get("popularity") or 0), int(item["id"])),
            reverse=True,
        )
        orders[key] = [int(item["id"]) for item in ranked[:limit]]
    return orders


@router.get("/feed")
def recommendation_feed(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    if current_user.role != UserRole.student:
        raise HTTPException(status_code=403, detail="Student account required")

    limit = max(1, min(get_settings().ai_recommendation_limit, 100))
    profile = _build_student_profile(db, current_user)
    candidates = _build_candidates(db)

    return {
        "personalized": True,
        "source": "local_profile",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "orders": _recommendation_orders(profile, candidates, limit),
    }
