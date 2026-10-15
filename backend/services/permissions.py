from enum import Enum

from fastapi import Depends, HTTPException

from backend.models import User
from backend.services.auth import require_user


class Role(str, Enum):
    admin = "admin"


PERMISSIONS: dict[str, frozenset[str]] = {
    Role.admin.value: frozenset({"*"}),
}


def has_permission(role: str, permission: str) -> bool:
    granted = PERMISSIONS.get(role, frozenset())
    return "*" in granted or permission in granted


def require(permission: str):
    async def checker(user: User = Depends(require_user)) -> User:
        if not has_permission(user.role, permission):
            raise HTTPException(403, "Недостаточно прав для этого действия")
        return user

    return checker
