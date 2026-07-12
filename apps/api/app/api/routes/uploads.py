from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.models import User, UserRole

router = APIRouter()

VIDEO_UPLOAD_KINDS = {"course_intro_video", "lesson_video"}
HANDOUT_UPLOAD_KINDS = {"handout"}
IMAGE_UPLOAD_KINDS = {"course_cover", "question_media", "avatar", "logo", "student_post_image"}
UPLOAD_LIMITS = {
    "video": 200 * 1024 * 1024,
    "handout": 30 * 1024 * 1024,
    "image": 8 * 1024 * 1024,
}


ADMIN_UPLOAD_ROLES = {UserRole.institution_admin, UserRole.super_admin}
STAFF_UPLOAD_ROLES = {UserRole.teacher, UserRole.institution_admin, UserRole.super_admin}
STAFF_UPLOAD_KINDS = VIDEO_UPLOAD_KINDS | HANDOUT_UPLOAD_KINDS | {"course_cover", "question_media", "avatar"}
ADMIN_ONLY_UPLOAD_KINDS = {"logo"}
STUDENT_UPLOAD_KINDS = {"student_post_image"}


def ensure_upload_permission(kind: str, current_user: User) -> None:
    if kind in STUDENT_UPLOAD_KINDS:
        if current_user.role != UserRole.student:
            raise HTTPException(status_code=403, detail="Student role required")
        return
    if kind in ADMIN_ONLY_UPLOAD_KINDS:
        if current_user.role not in ADMIN_UPLOAD_ROLES:
            raise HTTPException(status_code=403, detail="Admin role required")
        return
    if kind in STAFF_UPLOAD_KINDS:
        if current_user.role not in STAFF_UPLOAD_ROLES:
            raise HTTPException(status_code=403, detail="Course management role required")
        return
    raise HTTPException(status_code=422, detail="Unsupported upload kind")


def is_markdown_handout(filename: str | None, content_type: str | None) -> bool:
    suffix = Path(filename or "").suffix.lower()
    return suffix == ".md"


def upload_category(kind: str, content_type: str | None, filename: str | None = None) -> str:
    if kind in VIDEO_UPLOAD_KINDS:
        if not content_type or not content_type.startswith("video/"):
            raise HTTPException(status_code=422, detail="Please upload a video file")
        return "video"
    if kind in HANDOUT_UPLOAD_KINDS:
        if not is_markdown_handout(filename, content_type):
            raise HTTPException(status_code=422, detail="Handouts must be Markdown .md files")
        return "handout"
    if kind in IMAGE_UPLOAD_KINDS:
        if not content_type or not content_type.startswith("image/"):
            raise HTTPException(status_code=422, detail="Please upload an image file")
        return "image"
    raise HTTPException(status_code=422, detail="Unsupported upload kind")


def safe_extension(filename: str, content_type: str | None) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix and len(suffix) <= 12:
        return suffix
    if content_type:
        return {
            "video/mp4": ".mp4",
            "video/webm": ".webm",
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "application/pdf": ".pdf",
            "text/plain": ".txt",
        }.get(content_type, "")
    return ""


@router.post("/admin/uploads")
async def upload_admin_file(
    request: Request,
    kind: str = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> dict[str, str | int]:
    ensure_upload_permission(kind, current_user)
    category = upload_category(kind, file.content_type, file.filename)
    settings = get_settings()
    upload_root = Path(settings.upload_dir)
    target_dir = upload_root / category
    target_dir.mkdir(parents=True, exist_ok=True)

    extension = safe_extension(file.filename or "", file.content_type)
    filename = f"{uuid4().hex}{extension}"
    target_path = target_dir / filename
    max_bytes = UPLOAD_LIMITS[category]
    total_bytes = 0

    try:
        with target_path.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                total_bytes += len(chunk)
                if total_bytes > max_bytes:
                    raise HTTPException(status_code=413, detail="Uploaded file is too large")
                output.write(chunk)
    except HTTPException:
        target_path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    relative_path = f"{category}/{filename}"
    url = str(request.url_for("uploads", path=relative_path))
    return {"url": url, "filename": file.filename or filename, "size": total_bytes}


@router.post("/student/uploads")
async def upload_student_file(
    request: Request,
    kind: str = Form("student_post_image"),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> dict[str, str | int]:
    if kind != "student_post_image":
        raise HTTPException(status_code=422, detail="Unsupported student upload kind")
    return await upload_admin_file(request=request, kind=kind, file=file, current_user=current_user)
