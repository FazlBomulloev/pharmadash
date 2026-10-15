import httpx
import pytest_asyncio
from sqlalchemy.ext.asyncio import (
    AsyncSession, async_sessionmaker, create_async_engine,
)
from sqlalchemy.pool import StaticPool

from backend.database import get_db
from backend.main import app
from backend.models import Base, User
from backend.services.auth import hash_password

PUBLIC = {"/api/auth/login", "/api/auth/logout", "/api/auth/session"}
LOGIN = "tester"
PASSWORD = "correct horse"


@pytest_asyncio.fixture
async def client():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False,
    )
    async with factory() as s:
        h, salt = hash_password(PASSWORD)
        s.add(User(username=LOGIN, password_hash=h, password_salt=salt))
        await s.commit()

    async def override():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test",
    ) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)
    await engine.dispose()


async def test_every_api_route_requires_auth(client):
    checked = 0
    for route in app.routes:
        path = getattr(route, "path", "")
        if not path.startswith("/api") or path in PUBLIC:
            continue
        for method in (getattr(route, "methods", set()) or {"GET"}):
            if method in {"HEAD", "OPTIONS"}:
                continue
            url = path.replace("{market_id}", "1").replace("{mnn}", "X")
            url = url.replace("{direction_name:path}", "X")
            url = url.replace("{producer_name}", "X")
            url = url.replace("{country_name}", "X")
            url = url.replace("{slug}", "x").replace("{price_id}", "1")
            assert "{" not in url, f"не подставлен параметр в {path}"
            r = await client.request(method, url)
            assert r.status_code == 401, (
                f"{method} {path} отдал {r.status_code}, а не 401"
            )
            checked += 1
    assert checked > 10, (
        f"проверено всего {checked} маршрутов — похоже, сбор не сработал"
    )


async def test_login_ok_sets_cookie_and_grants_access(client):
    r = await client.post(
        "/api/auth/login", json={"username": LOGIN, "password": PASSWORD},
    )
    assert r.status_code == 200
    assert "epi_session" in r.cookies
    header = r.headers["set-cookie"].lower()
    assert "httponly" in header and "samesite=lax" in header
    r = await client.get("/api/markets")
    assert r.status_code == 200
    r = await client.get("/api/auth/session")
    assert r.status_code == 200 and r.json()["username"] == LOGIN
    r = await client.post("/api/auth/logout")
    assert r.status_code == 200
    r = await client.get("/api/markets")
    assert r.status_code == 401


async def test_login_wrong_password_rejected_without_cookie(client):
    for body in (
        {"username": LOGIN, "password": "wrong"},
        {"username": "nobody", "password": PASSWORD},
    ):
        r = await client.post("/api/auth/login", json=body)
        assert r.status_code == 401
        assert r.json()["detail"] == "Неверный логин или пароль"
        assert "set-cookie" not in r.headers
