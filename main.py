# -*- coding: utf-8 -*-
"""杭州主城区游玩锻炼一日路线规划器 —— FastAPI Web 入口。

纯规则引擎，不依赖任何大模型。高德 API Key 只来自：
  1. 用户网页输入的 session 会话；
  2. 系统环境变量 AMAP_KEY。
代码中不硬编码任何高德密钥。
"""
import os

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

import utils

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = FastAPI(title="杭州主城区游玩锻炼一日路线规划器")

app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ.get("SESSION_SECRET", "hangzhou-day-trip-planner-dev-secret"),
)

templates = Jinja2Templates(directory="templates")


def _default_form():
    return {
        "origin": "",
        "destination": "",
        "hiking": "是",
        "must_visit": [],
        "count": 3,
    }


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    env_key = os.environ.get("AMAP_KEY", "")
    return templates.TemplateResponse(request, "index.html", {
        "has_env_key": bool(env_key),
        "error": None,
        "form": _default_form(),
    })


@app.get("/api/address_tree")
async def address_tree():
    """只读接口：返回主城区 -> 街道 -> 小区 三级联动数据。"""
    return utils.DISTRICT_STREET_COMMUNITY


@app.post("/plan", response_class=HTMLResponse)
async def plan(request: Request):
    form = await request.form()

    origin = (form.get("origin") or "").strip()
    destination = (form.get("destination") or "").strip()
    hiking = (form.get("hiking") or "是").strip()
    count_raw = (form.get("count") or "3").strip()
    amap_key = (form.get("amap_key") or "").strip()
    must_visit = [v.strip() for v in form.getlist("must_visit") if v and v.strip()]

    # 网页输入的 key 覆盖 session；未填写则沿用 session；再否则用环境变量
    if amap_key:
        request.session["amap_key"] = amap_key
    key = request.session.get("amap_key") or os.environ.get("AMAP_KEY", "")

    form_data = {
        "origin": origin,
        "destination": destination,
        "hiking": hiking if hiking in ("是", "否") else "是",
        "must_visit": must_visit,
        "count": count_raw,
    }

    def render_index(error):
        return templates.TemplateResponse(request, "index.html", {
            "has_env_key": bool(os.environ.get("AMAP_KEY", "")),
            "error": error,
            "form": form_data,
        })

    # 基础校验
    if not origin or not destination:
        return render_index("请填写出发地址和返回地址")
    try:
        count = int(count_raw)
    except ValueError:
        return render_index("游玩景点数量必须是 1-6 之间的数字")
    if not (1 <= count <= 6):
        return render_index("游玩景点数量必须在 1-6 之间")
    hiking_bool = hiking == "是"
    if not key:
        return render_index("请先填写高德 API Key，或设置环境变量 AMAP_KEY")

    # 纯规则引擎规划
    try:
        plan_data = utils.plan_trip(
            origin, destination, hiking_bool, must_visit, count, key
        )
    except utils.PlanError as exc:
        return render_index(str(exc))
    except Exception as exc:  # 兜底：任何意外都不让程序崩溃
        return render_index(f"规划过程出现异常：{exc}")

    return templates.TemplateResponse(request, "result.html", {
        "plan": plan_data,
    })
