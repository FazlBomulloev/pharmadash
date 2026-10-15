import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import COOKIE_SECURE, SESSION_COOKIE, SESSION_DAYS
from backend.database import get_db
from backend.models import User
from backend.schemas import LoginRequest, SessionEnvelope, SessionOut
from backend.services.permissions import PERMISSIONS
from backend.services.auth import (
    authenticate, create_session, delete_session, get_user_by_token,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


def _session_out(user: User) -> SessionOut:
    return SessionOut(
        id=user.id,
        username=user.username,
        role=user.role,
        permissions=sorted(PERMISSIONS.get(user.role, frozenset())),
    )


@router.post("/login", response_model=SessionOut)
async def login(
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    user = await authenticate(db, body.username, body.password)
    if user is None:
        log.warning("Неудачная попытка входа: логин «%s»", body.username[:100])
        raise HTTPException(401, "Неверный логин или пароль")
    token = await create_session(db, user)
    response.set_cookie(
        SESSION_COOKIE, token,
        max_age=SESSION_DAYS * 86400,
        httponly=True, samesite="lax", secure=COOKIE_SECURE, path="/",
    )
    return _session_out(user)


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        await delete_session(db, token)
    response.delete_cookie(
        SESSION_COOKIE, path="/", httponly=True,
        samesite="lax", secure=COOKIE_SECURE,
    )
    return {"ok": True}


@router.get("/session", response_model=SessionEnvelope)
async def session(
    request: Request, db: AsyncSession = Depends(get_db),
):
    """Кто вошёл. Отсутствие сессии — не ошибка, а ответ «никто».

    Если отдавать здесь 401, браузер пишет красную строку в консоль при
    каждом открытии страницы входа, и это выглядит дефектом у любого, кто
    откроет инструменты разработчика.
    """
    user = await get_user_by_token(db, request.cookies.get(SESSION_COOKIE))
    return SessionEnvelope(user=_session_out(user) if user else None)
