from fastapi import APIRouter

from app.api.routes import admin, auth, catalog, learning, payments, uploads

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(catalog.router, tags=["catalog"])
api_router.include_router(learning.router, prefix="/learn", tags=["learning"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(payments.router, prefix="/payments", tags=["payments"])
api_router.include_router(uploads.router, tags=["uploads"])
