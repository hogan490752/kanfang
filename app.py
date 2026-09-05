# -*- coding: utf-8 -*-
"""看房对比小站 · Flask 后端
数据存 SQLite，视频存 static/uploads/，首次启动自动从 static/seed.json 导入 15 个小区。
"""
import os
import sqlite3
import re
import json
import math

from flask import Flask, request, jsonify, send_from_directory, abort, g

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "houses.db")
UPLOAD_DIR = os.path.join(BASE_DIR, "static", "uploads")
SEED_PATH = os.path.join(BASE_DIR, "static", "seed.json")

# 可选访问口令：设置环境变量 SITE_PASSWORD 后，页面首次打开需要输入
SITE_PASSWORD = os.environ.get("SITE_PASSWORD", "")

os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__, static_folder=os.path.join(BASE_DIR, "static"), static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024 * 1024  # 最大 1G，防止误传超大文件
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0  # 静态文件不缓存，改完代码刷新即生效

ALLOWED_VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm"}
VIDEO_MIME = {".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm"}

_HOUSE_FIELDS = [
    "region", "name", "property_company", "property_fee", "pros", "cons",
    "metro", "metro_ok", "kindergarten", "primary_school", "middle_school",
    "middle_fixed", "car_free", "location", "notes", "longitude", "latitude",
]


# ---------- 数据库 ----------

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS houses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            region TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL,
            property_company TEXT DEFAULT '',
            property_fee TEXT DEFAULT '',
            pros TEXT DEFAULT '',
            cons TEXT DEFAULT '',
            metro TEXT DEFAULT '',
            metro_ok INTEGER DEFAULT 0,
            kindergarten TEXT DEFAULT '',
            primary_school TEXT DEFAULT '',
            middle_school TEXT DEFAULT '',
            middle_fixed INTEGER DEFAULT 0,
            car_free INTEGER DEFAULT 0,
            location TEXT DEFAULT '',
            longitude REAL,
            latitude REAL,
            notes TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        );
        CREATE TABLE IF NOT EXISTS rooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            house_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            size TEXT DEFAULT '',
            price TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            house_id INTEGER NOT NULL,
            room_id INTEGER,                -- 老数据为 NULL（挂在小区上），新数据挂在房间下
            filename TEXT NOT NULL,
            orig_name TEXT NOT NULL,
            size INTEGER DEFAULT 0,
            label TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE,
            FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
        );
        """
    )
    # 老库迁移：videos 表补 room_id 列
    cols = [r[1] for r in db.execute("PRAGMA table_info(videos)")]
    if "room_id" not in cols:
        db.execute("ALTER TABLE videos ADD COLUMN room_id INTEGER")
    # 老库迁移：位置坐标可为空，不影响已有小区、房子和视频。
    house_cols = [r[1] for r in db.execute("PRAGMA table_info(houses)")]
    for field in ("longitude", "latitude"):
        if field not in house_cols:
            db.execute(f"ALTER TABLE houses ADD COLUMN {field} REAL")
    # 首次启动：导入种子数据
    count = db.execute("SELECT COUNT(*) FROM houses").fetchone()[0]
    if count == 0 and os.path.exists(SEED_PATH):
        with open(SEED_PATH, encoding="utf-8") as f:
            seed = json.load(f)
        for i, h in enumerate(seed.get("house", [])):
            db.execute(
                "INSERT INTO houses (region,name,property_company,property_fee,pros,cons,metro,metro_ok,"
                "kindergarten,primary_school,middle_school,middle_fixed,car_free,location,notes,sort_order)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    h.get("region", ""), h.get("name", ""), h.get("property_company", ""), h.get("property_fee", ""),
                    h.get("pros", ""), h.get("cons", ""), h.get("metro", ""), 1 if h.get("metro_ok") else 0,
                    h.get("kindergarten", ""), h.get("primary_school", ""), h.get("middle_school", ""),
                    1 if h.get("middle_fixed") else 0, 1 if h.get("car_free") else 0,
                    h.get("location", ""), h.get("notes", ""), i,
                ),
            )
    db.commit()
    db.close()


# ---------- 访问口令 ----------

def check_password():
    """设置了 SITE_PASSWORD 时校验；未设置则放行。"""
    if not SITE_PASSWORD:
        return True
    pw = request.headers.get("X-Site-Password") or request.args.get("pw", "")
    return pw == SITE_PASSWORD


@app.after_request
def add_headers(resp):
    # 允许手机局域网直接访问视频并拖动进度条
    resp.headers.setdefault("Accept-Ranges", "bytes")
    return resp


# ---------- 页面 ----------

@app.route("/")
def page_index():
    return send_from_directory(os.path.join(BASE_DIR, "templates"), "index.html")


@app.route("/upload")
def page_upload():
    return send_from_directory(os.path.join(BASE_DIR, "templates"), "upload.html")


@app.get("/api/map-config")
def api_map_config():
    if not check_password():
        return jsonify({"error": "需要访问口令"}), 401
    config = {}
    path = os.path.join(BASE_DIR, "map_config.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            config = json.load(f)
    response = jsonify({
        "key": os.environ.get("AMAP_KEY", config.get("key", "")),
        "securityJsCode": os.environ.get("AMAP_SECURITY_JS_CODE", config.get("securityJsCode", "")),
    })
    response.headers["Cache-Control"] = "no-store"
    return response


# ---------- 房源 API ----------

def _row_to_house(r):
    d = dict(r)
    d["metro_ok"] = bool(d["metro_ok"])
    d["middle_fixed"] = bool(d["middle_fixed"])
    d["car_free"] = bool(d["car_free"])
    return d


def _row_to_video(r):
    d = dict(r)
    d["url"] = f"/api/videos/{d['id']}/file"
    return d


def _coordinates(data, existing=None):
    """坐标成对填写或清空；旧客户端未传坐标时保留原值。"""
    values = []
    for field, label, limit in (("longitude", "经度", 180), ("latitude", "纬度", 90)):
        value = data.get(field, existing[field] if existing is not None else None)
        if value is None or (isinstance(value, str) and not value.strip()):
            values.append(None)
            continue
        if isinstance(value, bool) or not isinstance(value, (str, int, float)):
            raise ValueError(f"{label}必须是有效数字")
        try:
            value = float(value)
        except (ValueError, OverflowError):
            raise ValueError(f"{label}必须是有效数字") from None
        if not math.isfinite(value) or not -limit <= value <= limit:
            raise ValueError(f"{label}必须在 {-limit} 到 {limit} 之间")
        values.append(value)
    if (values[0] is None) != (values[1] is None):
        raise ValueError("请同时填写经度和纬度，或同时留空")
    return tuple(values)


@app.get("/api/houses")
def api_houses():
    if not check_password():
        return jsonify({"error": "需要访问口令"}), 401
    db = get_db()
    houses = [dict(_row_to_house(r)) for r in db.execute("SELECT * FROM houses ORDER BY sort_order, id")]
    vids = {}
    for v in db.execute("SELECT * FROM videos ORDER BY id"):
        d = _row_to_video(v)
        vids.setdefault(d["house_id"], []).append(d)
    rooms = {}
    for r in db.execute("SELECT * FROM rooms ORDER BY sort_order, id"):
        d = dict(r)
        d["videos"] = []
        rooms[d["id"]] = d
    # 挂到房间下的视频
    for v in list(vids.values()):
        for d in v:
            if d["room_id"] and d["room_id"] in rooms:
                rooms[d["room_id"]]["videos"].append(d)
    # 每个小区：房间列表 + 小区级直挂视频（老数据）
    for h in houses:
        h["rooms"] = [r for r in rooms.values() if r["house_id"] == h["id"]]
        h["videos"] = [d for d in vids.get(h["id"], []) if not d["room_id"]]
    return jsonify({"password_required": bool(SITE_PASSWORD), "houses": houses})


@app.post("/api/houses")
def api_add_house():
    if not check_password():
        return jsonify({"error": "需要访问口令"}), 401
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "小区名称不能为空"}), 400
    try:
        longitude, latitude = _coordinates(data)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    db = get_db()
    dup = db.execute("SELECT id FROM houses WHERE name = ?", (name,)).fetchone()
    if dup:
        return jsonify({"error": f"小区「{name}」已存在"}), 409
    cur = db.execute(
        "INSERT INTO houses (region,name,property_company,property_fee,pros,cons,metro,metro_ok,"
        "kindergarten,primary_school,middle_school,middle_fixed,car_free,location,notes,longitude,latitude,sort_order)"
        " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM houses))",
        (
            (data.get("region") or "").strip(), name, (data.get("property_company") or "").strip(),
            (data.get("property_fee") or "").strip(), (data.get("pros") or "").strip(),
            (data.get("cons") or "").strip(), (data.get("metro") or "").strip(),
            1 if data.get("metro_ok") else 0, (data.get("kindergarten") or "").strip(),
            (data.get("primary_school") or "").strip(), (data.get("middle_school") or "").strip(),
            1 if data.get("middle_fixed") else 0, 1 if data.get("car_free") else 0,
            (data.get("location") or "").strip(), (data.get("notes") or "").strip(),
            longitude, latitude,
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM houses WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify({"house": _row_to_house(row)}), 201


@app.put("/api/houses/<int:hid>")
def api_edit_house(hid):
    if not check_password():
        return jsonify({"error": "需要访问口令"}), 401
    db = get_db()
    row = db.execute("SELECT * FROM houses WHERE id = ?", (hid,)).fetchone()
    if not row:
        return jsonify({"error": "小区不存在"}), 404
    data = request.get_json(silent=True) or {}
    try:
        longitude, latitude = _coordinates(data, row)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "小区名称不能为空"}), 400
    dup = db.execute("SELECT id FROM houses WHERE name = ? AND id != ?", (name, hid)).fetchone()
    if dup:
        return jsonify({"error": f"小区「{name}」已存在"}), 409
    db.execute(
        "UPDATE houses SET region=?,name=?,property_company=?,property_fee=?,pros=?,cons=?,metro=?,metro_ok=?,"
        "kindergarten=?,primary_school=?,middle_school=?,middle_fixed=?,car_free=?,location=?,notes=?,longitude=?,latitude=? WHERE id=?",
        (
            (data.get("region") or "").strip(), name, (data.get("property_company") or "").strip(),
            (data.get("property_fee") or "").strip(), (data.get("pros") or "").strip(),
            (data.get("cons") or "").strip(), (data.get("metro") or "").strip(),
            1 if data.get("metro_ok") else 0, (data.get("kindergarten") or "").strip(),
            (data.get("primary_school") or "").strip(), (data.get("middle_school") or "").strip(),
            1 if data.get("middle_fixed") else 0, 1 if data.get("car_free") else 0,
            (data.get("location") or "").strip(), (data.get("notes") or "").strip(), longitude, latitude, hid,
        ),
    )
    db.commit()
    updated = db.execute("SELECT * FROM houses WHERE id = ?", (hid,)).fetchone()
    return jsonify({"house": _row_to_house(updated)})


@app.delete("/api/houses/<int:hid>")
def api_del_house(hid):
    if not check_password():
        return jsonify({"error": "需要访问口令"}), 401
    db = get_db()
    row = db.execute("SELECT * FROM houses WHERE id = ?", (hid,)).fetchone()
    if not row:
        return jsonify({"error": "小区不存在"}), 404
    # 先删视频文件，再删记录（记录靠外键 CASCADE 连带删）
    for v in db.execute("SELECT * FROM videos WHERE house_id = ?", (hid,)):
        path = os.path.join(UPLOAD_DIR, v["filename"])
        if os.path.exists(path):
            os.remove(path)
    db.execute("DELETE FROM houses WHERE id = ?", (hid,))
    db.commit()
    return jsonify({"ok": True})


# ---------- 房间 API（小区里的某一套房） ----------

@app.post("/api/houses/<int:hid>/rooms")
def api_add_room(hid):
    if not check_password():
        return jsonify({"error": "需要访问口令"}), 401
    db = get_db()
    if not db.execute("SELECT id FROM houses WHERE id = ?", (hid,)).fetchone():
        return jsonify({"error": "小区不存在"}), 404
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "房子名称不能为空（可用户型+栋号，如“2栋 3室2厅”）"}), 400
    cur = db.execute(
        "INSERT INTO rooms (house_id,title,size,price,notes,sort_order)"
        " VALUES (?,?,?,?,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM rooms WHERE house_id=?))",
        (hid, title, (data.get("size") or "").strip(), (data.get("price") or "").strip(),
         (data.get("notes") or "").strip(), hid),
    )
    db.commit()
    r = db.execute("SELECT * FROM rooms WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify({"room": dict(r)}), 201


@app.put("/api/rooms/<int:rid>")
def api_edit_room(rid):
    if not check_password():
        return jsonify({"error": "需要访问口令"}), 401
    db = get_db()
    if not db.execute("SELECT id FROM rooms WHERE id = ?", (rid,)).fetchone():
        return jsonify({"error": "房子不存在"}), 404
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "房子名称不能为空"}), 400
    db.execute(
        "UPDATE rooms SET title=?, size=?, price=?, notes=? WHERE id=?",
        (title, (data.get("size") or "").strip(), (data.get("price") or "").strip(),
         (data.get("notes") or "").strip(), rid),
    )
    db.commit()
    r = db.execute("SELECT * FROM rooms WHERE id = ?", (rid,)).fetchone()
    return jsonify({"room": dict(r)})


@app.delete("/api/rooms/<int:rid>")
def api_del_room(rid):
    if not check_password():
        return jsonify({"error": "需要访问口令"}), 401
    db = get_db()
    room = db.execute("SELECT * FROM rooms WHERE id = ?", (rid,)).fetchone()
    if not room:
        return jsonify({"error": "房子不存在"}), 404
    # 先删视频文件，记录靠 CASCADE
    for v in db.execute("SELECT * FROM videos WHERE room_id = ?", (rid,)):
        path = os.path.join(UPLOAD_DIR, v["filename"])
        if os.path.exists(path):
            os.remove(path)
    db.execute("DELETE FROM rooms WHERE id = ?", (rid,))
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/rooms/<int:rid>/videos")
def api_upload_room_video(rid):
    """视频直接传到某套房下。"""
    if not check_password():
        return jsonify({"error": "需要访问口令"}), 401
    db = get_db()
    room = db.execute("SELECT * FROM rooms WHERE id = ?", (rid,)).fetchone()
    if not room:
        return jsonify({"error": "房子不存在"}), 404
    return _save_video(db, room["house_id"], rid)


def _save_video(db, hid, rid):
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"error": "没有收到视频文件"}), 400
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in ALLOWED_VIDEO_EXT:
        return jsonify({"error": f"暂不支持 {ext or '无后缀'} 格式，请用 mp4 / mov / webm"}), 400
    orig = _safe_filename(f.filename)
    stored = f"h{hid}_r{rid or 0}_{orig}"
    # 同名覆盖前先删旧记录，保证文件名唯一对应一条记录
    old = db.execute("SELECT id FROM videos WHERE filename = ?", (stored,)).fetchone()
    if old:
        db.execute("DELETE FROM videos WHERE id = ?", (old["id"],))
        db.commit()
    path = os.path.join(UPLOAD_DIR, stored)
    f.save(path)
    label = (request.form.get("label") or "").strip()[:50]
    cur = db.execute(
        "INSERT INTO videos (house_id, room_id, filename, orig_name, size, label) VALUES (?,?,?,?,?,?)",
        (hid, rid, stored, orig, os.path.getsize(path), label),
    )
    db.commit()
    v = db.execute("SELECT * FROM videos WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify({"video": _row_to_video(v)}), 201


# ---------- 视频 API ----------

def _safe_filename(name):
    name = os.path.basename(name or "")
    name = re.sub(r'[\\/:*?"<>|]', "_", name).strip() or "video"
    return name[:120]


@app.post("/api/houses/<int:hid>/videos")
def api_upload_video(hid):
    if not check_password():
        return jsonify({"error": "需要访问口令"}), 401
    db = get_db()
    house = db.execute("SELECT id FROM houses WHERE id = ?", (hid,)).fetchone()
    if not house:
        return jsonify({"error": "小区不存在"}), 404
    return _save_video(db, hid, None)


@app.get("/api/videos/<int:vid>/file")
def api_video_file(vid):
    db = get_db()
    v = db.execute("SELECT * FROM videos WHERE id = ?", (vid,)).fetchone()
    if not v:
        abort(404)
    path = os.path.join(UPLOAD_DIR, v["filename"])
    if not os.path.exists(path):
        abort(404)
    mime = VIDEO_MIME.get(os.path.splitext(v["filename"])[1].lower(), "video/mp4")
    rv = send_from_directory(UPLOAD_DIR, v["filename"], mimetype=mime, conditional=True)
    rv.headers["Content-Disposition"] = "inline"
    return rv


@app.delete("/api/videos/<int:vid>")
def api_del_video(vid):
    if not check_password():
        return jsonify({"error": "需要访问口令"}), 401
    db = get_db()
    v = db.execute("SELECT * FROM videos WHERE id = ?", (vid,)).fetchone()
    if not v:
        return jsonify({"error": "视频不存在"}), 404
    path = os.path.join(UPLOAD_DIR, v["filename"])
    if os.path.exists(path):
        os.remove(path)
    db.execute("DELETE FROM videos WHERE id = ?", (vid,))
    db.commit()
    return jsonify({"ok": True})


init_db()

if __name__ == "__main__":
    # 手机通过局域网访问：http://<电脑IP>:5000
    app.run(host="0.0.0.0", port=5000, debug=False)
