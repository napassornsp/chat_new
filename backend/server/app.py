# backend/server/app.py
import os, secrets, json
from datetime import datetime, timezone, timedelta
from flask import Flask, request, jsonify, make_response, g, abort
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import Integer, String, Text, text
from sqlalchemy.dialects.sqlite import JSON as SQLITE_JSON
from typing import Optional

try:
    from PIL import Image
except Exception:  # Pillow not installed
    Image = None

DB_URL = os.environ.get("OFFLINE_DB_URL", "sqlite:///offline.db")
SECRET = os.environ.get("OFFLINE_SECRET", "dev-secret")
PORT = int(os.environ.get("PORT", "5001"))

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = DB_URL
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = SECRET

CORS(
    app,
    resources={r"/*": {"origins": "*"}},
    supports_credentials=False,
    methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

db = SQLAlchemy(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# ---------- Models ----------
class User(db.Model):
    __tablename__ = "users"
    id = db.Column(Integer, primary_key=True)
    email = db.Column(String, unique=True, nullable=False)
    name = db.Column(String, nullable=False)
    password_hash = db.Column(String, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self, include_profile=False):
        d = {"id": self.id, "email": self.email, "name": self.name}
        if include_profile:
            prof = db.session.get(Profile, self.id)
            d["profile"] = prof.to_dict() if prof else None
        return d


class Profile(db.Model):
    __tablename__ = "profiles"
    id = db.Column(Integer, primary_key=True)
    full_name = db.Column(String, nullable=True)
    avatar_url = db.Column(String, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "full_name": self.full_name,
            "avatar_url": self.avatar_url,
            "created_at": self.created_at.isoformat(),
        }


class UserCredit(db.Model):
    __tablename__ = "user_credits"
    id = db.Column(Integer, primary_key=True)  # == users.id
    # Plan + monthly counters
    plan = db.Column(String, default="free")  # free | plus | business | admin
    chat_used = db.Column(Integer, default=0)
    ocr_bill_used = db.Column(Integer, default=0)
    ocr_bank_used = db.Column(Integer, default=0)
    last_reset_at = db.Column(String, nullable=True)  # ISO date string YYYY-MM
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)
    # legacy column (ignored by new code, kept for migration safety)
    credits = db.Column(Integer, default=0)
    # NEW: per-user override limits (nullable). If set (>0) they override plan defaults.
    chat_limit = db.Column(Integer, nullable=True)
    ocr_bill_limit = db.Column(Integer, nullable=True)
    ocr_bank_limit = db.Column(Integer, nullable=True)


class Chat(db.Model):
    __tablename__ = "chats"
    id = db.Column(Integer, primary_key=True)
    user_id = db.Column(Integer, db.ForeignKey("users.id"), nullable=True)
    title = db.Column(String, nullable=True)
    last_message = db.Column(Text, nullable=True)
    messages_count = db.Column(Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)


class Message(db.Model):
    __tablename__ = "messages"
    id = db.Column(Integer, primary_key=True)
    chat_id = db.Column(Integer, db.ForeignKey("chats.id"), nullable=False)
    user_id = db.Column(Integer, db.ForeignKey("users.id"), nullable=True)
    content_json = db.Column(SQLITE_JSON, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


# ---------- OCR (new columns used by frontend) ----------
class OCRBillExtract(db.Model):
    __tablename__ = "ocr_bill_extractions"
    id = db.Column(Integer, primary_key=True)
    user_id = db.Column(Integer, db.ForeignKey("users.id"), nullable=True)
    filename = db.Column(String, nullable=True)
    file_url = db.Column(String, nullable=True)
    approved = db.Column(Integer, default=0)  # 0/1; exposed as bool in serializer
    data_json = db.Column(SQLITE_JSON, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class OCRBankExtract(db.Model):
    __tablename__ = "ocr_bank_extractions"
    id = db.Column(Integer, primary_key=True)
    user_id = db.Column(Integer, db.ForeignKey("users.id"), nullable=True)
    filename = db.Column(String, nullable=True)
    file_url = db.Column(String, nullable=True)
    approved = db.Column(Integer, default=0)
    data_json = db.Column(SQLITE_JSON, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Notification(db.Model):
    __tablename__ = "notifications"
    id = db.Column(Integer, primary_key=True)
    user_id = db.Column(Integer, db.ForeignKey("users.id"), nullable=False)
    title = db.Column(String, nullable=False)
    body = db.Column(Text, nullable=True)
    read_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Session(db.Model):
    __tablename__ = "sessions"
    token = db.Column(String, primary_key=True)
    user_id = db.Column(Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


# NEW: requests captured from “Contact sales / Purchase” popup
class SalesRequest(db.Model):
    __tablename__ = "sales_requests"
    id = db.Column(Integer, primary_key=True)
    user_id = db.Column(Integer, db.ForeignKey("users.id"), nullable=False)
    requested_plan = db.Column(String, nullable=True)  # "plus" | "business"
    name = db.Column(String, nullable=True)
    email = db.Column(String, nullable=True)
    phone = db.Column(String, nullable=True)
    company = db.Column(String, nullable=True)
    location = db.Column(String, nullable=True)
    message = db.Column(Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


# ---------- Vision: Flower (YOLO-style dummy) ----------
@app.post("/vision/flower/detect")
def flower_detect():
    current_user_required()
    f = request.files.get("file")
    w, h = 640, 480
    try:
        if f is not None and Image is not None:
            im = Image.open(f.stream)
            w, h = im.size
    except Exception:
        pass
    boxes = [
        {"label": "Rose", "conf": 0.95, "xyxy": [int(0.05 * w), int(0.15 * h), int(0.45 * w), int(0.70 * h)], "color": "#ef4444"},
        {"label": "Tulip","conf": 0.88, "xyxy": [int(0.55 * w), int(0.25 * h), int(0.90 * w), int(0.70 * h)], "color": "#22c55e"},
        {"label": "Sunflower","conf": 0.82, "xyxy": [int(0.62 * w), int(0.06 * h), int(0.95 * w), int(0.24 * h)], "color": "#06b6d4"},
    ]
    return jsonify({"image": {"width": w, "height": h}, "boxes": boxes})


# ---------- Vision: Person (YOLO-style dummy) ----------
@app.post("/vision/person/detect")
def person_detect():
    current_user_required()
    f = request.files.get("file")
    w, h = 640, 480
    try:
        if f is not None and Image is not None:
            im = Image.open(f.stream)
            w, h = im.size
    except Exception:
        pass
    boxes = [
        {"label": "Person","conf": 0.97, "xyxy": [int(0.06 * w), int(0.12 * h), int(0.42 * w), int(0.86 * h)], "color": "#3b82f6"},
        {"label": "Person","conf": 0.94, "xyxy": [int(0.55 * w), int(0.18 * h), int(0.92 * w), int(0.88 * h)], "color": "#10b981"},
        {"label": "Face","conf": 0.91, "xyxy": [int(0.16 * w), int(0.18 * h), int(0.28 * w), int(0.34 * h)], "color": "#f59e0b"},
        {"label": "Upper Body","conf": 0.88, "xyxy": [int(0.62 * w), int(0.36 * h), int(0.88 * w), int(0.70 * h)], "color": "#ef4444"},
    ]
    return jsonify({"image": {"width": w, "height": h}, "boxes": boxes})


# ---------- Vision: Pet (YOLO-style dummy) ----------
@app.post("/vision/pet/detect")
def pet_detect():
    current_user_required()
    f = request.files.get("file")
    w, h = 640, 480
    try:
        if f is not None and Image is not None:
            im = Image.open(f.stream)
            w, h = im.size
    except Exception:
        pass
    boxes = [
        {"label": "Dog","conf": 0.96, "xyxy": [int(0.08 * w), int(0.45 * h), int(0.52 * w), int(0.92 * h)], "color": "#10b981"},
        {"label": "Cat","conf": 0.92, "xyxy": [int(0.60 * w), int(0.30 * h), int(0.92 * w), int(0.78 * h)], "color": "#f59e0b"},
        {"label": "Collar","conf": 0.85, "xyxy": [int(0.22 * w), int(0.70 * h), int(0.36 * w), int(0.78 * h)], "color": "#3b82f6"},
    ]
    return jsonify({"image": {"width": w, "height": h}, "boxes": boxes})


# ---------- Vision: Vehicle (YOLO-style dummy) ----------
@app.post("/vision/vehicle/detect")
def vehicle_detect():
    current_user_required()
    f = request.files.get("file")
    w, h = 640, 480
    try:
        if f is not None and Image is not None:
            im = Image.open(f.stream)
            w, h = im.size
    except Exception:
        pass
    boxes = [
        {"label": "Vehicle: Car","conf": 0.97, "xyxy": [int(0.06 * w), int(0.40 * h), int(0.60 * w), int(0.88 * h)], "color": "#ef4444"},
        {"label": "Vehicle: Truck","conf": 0.90, "xyxy": [int(0.62 * w), int(0.32 * h), int(0.94 * w), int(0.82 * h)], "color": "#06b6d4"},
        {"label": "Wheel","conf": 0.86, "xyxy": [int(0.20 * w), int(0.78 * h), int(0.30 * w), int(0.90 * h)], "color": "#22c55e"},
        {"label": "Headlight","conf": 0.83, "xyxy": [int(0.50 * w), int(0.52 * h), int(0.58 * w), int(0.60 * h)], "color": "#f59e0b"},
    ]
    return jsonify({"image": {"width": w, "height": h}, "boxes": boxes})


# ---------- Vision: Food Classification (mock) ----------
@app.post("/vision/food/classify")
def vision_food_classify():
    current_user_required()
    width, height = 640, 480
    try:
        f = request.files.get("file")
        if f and Image is not None:
            img = Image.open(f.stream); width, height = img.size
    except Exception:
        pass
    classes = [
        {"label": "Italian Cuisine", "confidence": 0.95},
        {"label": "Pasta", "confidence": 0.88},
        {"label": "Tomato Sauce", "confidence": 0.82},
    ]
    return jsonify({"image": {"width": width, "height": height}, "classes": classes})


# ---------- Vision: person Classification (mock) ----------
@app.post("/vision/person/classify")
def vision_person_classify():
    current_user_required()
    import time
    t0 = time.time()
    width, height = 640, 480
    try:
        f = request.files.get("file")
        if f and Image is not None:
            img = Image.open(f.stream)
            width, height = img.size
    except Exception:
        pass
    classes = [
        {"label": "Person Detected", "confidence": 0.98},
        {"label": "Frontal Face", "confidence": 0.93},
        {"label": "Pose: Standing", "confidence": 0.88},
        {"label": "Wearing Glasses", "confidence": 0.67},
        {"label": "Upper Body Visible", "confidence": 0.81},
    ]
    payload = {
        "image": {"width": width, "height": height},
        "classes": classes,
        "model": {"name": "mock-person-v1", "version": "1.0.0"},
        "meta": {"elapsed_ms": int((time.time() - t0) * 1000)},
    }
    return jsonify(payload), 200


# ---------- Vision: Pet Classification (mock) ----------
@app.post("/vision/pet/classify")
def vision_pet_classify():
    current_user_required()
    import time
    t0 = time.time()
    width, height = 640, 480
    try:
        f = request.files.get("file")
        if f and Image is not None:
            img = Image.open(f.stream)
            width, height = img.size
    except Exception:
        pass
    classes = [
        {"label": "Pet Detected", "confidence": 0.98},
        {"label": "Animal: Dog", "confidence": 0.94},
        {"label": "Animal: Cat", "confidence": 0.86},
        {"label": "Wearing Collar", "confidence": 0.72},
    ]
    payload = {
        "image": {"width": width, "height": height},
        "classes": classes,
        "model": {"name": "mock-pet-v1", "version": "1.0.0"},
        "meta": {"elapsed_ms": int((time.time() - t0) * 1000)},
    }
    return jsonify(payload), 200


# ---------- Vision: Vehicle Classification (mock) ----------
@app.post("/vision/vehicle/classify")
def vision_vehicle_classify():
    current_user_required()
    import time
    t0 = time.time()
    width, height = 640, 480
    try:
        f = request.files.get("file")
        if f and Image is not None:
            img = Image.open(f.stream)
            width, height = img.size
    except Exception:
        pass
    classes = [
        {"label": "Vehicle Detected", "confidence": 0.98},
        {"label": "Type: Car",        "confidence": 0.92},
        {"label": "Body Style: Sedan","confidence": 0.88},
        {"label": "View: Side",       "confidence": 0.76},
        {"label": "Color: Red",       "confidence": 0.64},
    ]
    payload = {
        "image": {"width": width, "height": height},
        "classes": classes,
        "model": {"name": "mock-vehicle-v1", "version": "1.0.0"},
        "meta": {"elapsed_ms": int((time.time() - t0) * 1000)},
    }
    return jsonify(payload), 200


# ---------- Helpers ----------
def now_ym():
    dt = datetime.now(timezone.utc)
    return f"{dt.year:04d}-{dt.month:02d}"


def current_user():
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        return None
    sess = Session.query.filter_by(token=token).first()
    return db.session.get(User, sess.user_id) if sess else None


@app.before_request
def attach_user():
    g.user = current_user()


def current_user_required():
    if not g.user:
        abort(401)
    return g.user


def ser(o):
    d = {c.name: getattr(o, c.name) for c in o.__table__.columns}
    for k, v in list(d.items()):
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()

    # messages content
    if "content_json" in d:
        cj = d.pop("content_json")
        try:
            cj = cj if isinstance(cj, dict) else json.loads(cj or "{}")
        except Exception:
            cj = {"text": str(cj)}
        d["content"] = cj
        if isinstance(cj, dict) and "role" in cj and "role" not in d:
            d["role"] = cj["role"]

    # OCR unified keys
    if "data_json" in d:
        d["data"] = d.pop("data_json")
    if "approved" in d:
        try:
            d["approved"] = bool(int(d["approved"]))
        except Exception:
            d["approved"] = bool(d["approved"])

    # legacy compatibility fallbacks
    if "filename" in d and (d["filename"] is None or d["filename"] == "") and "file_name" in d:
        d["filename"] = d.get("file_name")
    if "metadata_json" in d and "data" not in d:
        d["data"] = d.pop("metadata_json")

    # notifications: expose 'unread'
    if "read_at" in d:
        d["unread"] = d["read_at"] in (None, "", "null")

    return d


def model_columns(Model):
    return {c.name for c in Model.__table__.columns}


def sanitize_row(Model, row: dict):
    row = dict(row or {})
    cols = model_columns(Model)

    # chat/messages
    if "content" in row and "content_json" in cols and "content_json" not in row:
        row["content_json"] = row.pop("content")

    # OCR data normalization
    if "data" in row and "data_json" in cols and "data_json" not in row:
        row["data_json"] = row.pop("data")

    # filename alias for legacy tables (if someone still posts 'filename')
    if "filename" in row and "filename" not in cols and "file_name" in cols:
        row["file_name"] = row.pop("filename")

    # never allow overriding user_id
    row.pop("user_id", None)

    return {k: v for k, v in row.items() if k in cols}


@app.after_request
def add_cors_headers(resp):
    origin = request.headers.get("Origin")
    resp.headers["Access-Control-Allow-Origin"] = origin or "*"
    resp.headers["Vary"] = "Origin"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
    return resp


@app.route("/<path:_p>", methods=["OPTIONS"])
def cors_preflight(_p):
    return make_response("", 204)


# ---------- Auto-migrate ----------
def column_exists(table: str, column: str) -> bool:
    rows = db.session.execute(text(f"PRAGMA table_info({table})")).mappings().all()
    return any(r["name"] == column for r in rows)


def auto_migrate():
    # messages.content_json
    if column_exists("messages", "id") and not column_exists("messages", "content_json"):
        db.session.execute(text("ALTER TABLE messages ADD COLUMN content_json TEXT"))
        db.session.commit()

    # ensure modern OCR columns exist & copy legacy metadata_json -> data_json if needed
    for t in ("ocr_bill_extractions", "ocr_bank_extractions"):
        if column_exists(t, "id"):
            if not column_exists(t, "filename"):
                db.session.execute(text(f"ALTER TABLE {t} ADD COLUMN filename TEXT"))
            if not column_exists(t, "file_url"):
                db.session.execute(text(f"ALTER TABLE {t} ADD COLUMN file_url TEXT"))
            if not column_exists(t, "approved"):
                db.session.execute(text(f"ALTER TABLE {t} ADD COLUMN approved INTEGER DEFAULT 0"))
            if not column_exists(t, "data_json"):
                db.session.execute(text(f"ALTER TABLE {t} ADD COLUMN data_json TEXT"))
            if column_exists(t, "metadata_json"):
                db.session.execute(text(f"UPDATE {t} SET data_json = COALESCE(data_json, metadata_json)"))
        db.session.commit()

    # new credit fields
    if not column_exists("user_credits", "plan"):
        db.session.execute(text("ALTER TABLE user_credits ADD COLUMN plan TEXT DEFAULT 'free'"))
    if not column_exists("user_credits", "chat_used"):
        db.session.execute(text("ALTER TABLE user_credits ADD COLUMN chat_used INTEGER DEFAULT 0"))
    if not column_exists("user_credits", "ocr_bill_used"):
        db.session.execute(text("ALTER TABLE user_credits ADD COLUMN ocr_bill_used INTEGER DEFAULT 0"))
    if not column_exists("user_credits", "ocr_bank_used"):
        db.session.execute(text("ALTER TABLE user_credits ADD COLUMN ocr_bank_used INTEGER DEFAULT 0"))
    if not column_exists("user_credits", "last_reset_at"):
        db.session.execute(text("ALTER TABLE user_credits ADD COLUMN last_reset_at TEXT"))

    # NEW: per-user override limits
    if not column_exists("user_credits", "chat_limit"):
        db.session.execute(text("ALTER TABLE user_credits ADD COLUMN chat_limit INTEGER"))
    if not column_exists("user_credits", "ocr_bill_limit"):
        db.session.execute(text("ALTER TABLE user_credits ADD COLUMN ocr_bill_limit INTEGER"))
    if not column_exists("user_credits", "ocr_bank_limit"):
        db.session.execute(text("ALTER TABLE user_credits ADD COLUMN ocr_bank_limit INTEGER"))
    db.session.commit()


# ---------- Plans / limits ----------
CHAT_COST = {"V1": 1, "V2": 2, "V3": 3}

def plan_defaults(plan: str):
    """
    Default plan catalog. Business is contract-based (None = not fixed).
    """
    p = (plan or "free").lower()
    if p == "plus":
        return {"chat": 1000, "bill": 100, "bank": 100}
    if p == "business":
        return {"chat": None, "bill": None, "bank": None}  # contract-based
    if p == "admin":
        return {"chat": 10_000_000, "bill": 10_000_000, "bank": 10_000_000}
    return {"chat": 100, "bill": 3, "bank": 3}  # free

def effective_limits(row: "UserCredit"):
    """
    Effective user limits:
    - If per-user override exists (>0), use it.
    - Else use plan defaults (Business -> None = contract-based).
    """
    d = plan_defaults(row.plan)
    chat = row.chat_limit if (row.chat_limit or 0) > 0 else d["chat"]
    bill = row.ocr_bill_limit if (row.ocr_bill_limit or 0) > 0 else d["bill"]
    bank = row.ocr_bank_limit if (row.ocr_bank_limit or 0) > 0 else d["bank"]
    return {"chat": chat, "bill": bill, "bank": bank}

def reset_month_if_needed(row: UserCredit):
    ym = now_ym()
    if row.last_reset_at != ym:
        row.chat_used = 0
        row.ocr_bill_used = 0
        row.ocr_bank_used = 0
        row.last_reset_at = ym

def credits_payload(row: UserCredit):
    reset_month_if_needed(row)
    lim = effective_limits(row)

    def pack(used, limit):
        used = int(used or 0)
        if limit is None:  # contract-based / not fixed
            return {"limit": None, "used": used, "remaining": None, "percent_used": None}
        limit = int(limit or 0)
        remaining = max(0, limit - used)
        pct = 0 if limit <= 0 else round(min(100, max(0, used * 100 / limit)))
        return {"limit": limit, "used": used, "remaining": remaining, "percent_used": pct}

    return {
        "plan": row.plan or "free",
        "chat": pack(row.chat_used, lim["chat"]),
        "ocr_bill": pack(row.ocr_bill_used, lim["bill"]),
        "ocr_bank": pack(row.ocr_bank_used, lim["bank"]),
        "last_reset_at": row.last_reset_at,
    }

def load_or_create_credits(user_id: int, plan_default="free") -> UserCredit:
    row = db.session.get(UserCredit, user_id)
    if not row:
        row = UserCredit(id=user_id, plan=plan_default, last_reset_at=now_ym())
        db.session.add(row); db.session.commit()
    reset_month_if_needed(row)
    return row


# ---------- Seed ----------
def _ensure_user(
    email: str,
    name: str,
    password: str = "demo123",
    plan: str = "free",
    first_chat_title: str = "General",
):
    u = User.query.filter_by(email=email).first()
    if not u:
        u = User(email=email, name=name, password_hash=generate_password_hash(password))
        db.session.add(u); db.session.commit()

    prof = db.session.get(Profile, u.id)
    if not prof:
        db.session.add(Profile(id=u.id, full_name=name))

    uc = db.session.get(UserCredit, u.id)
    if not uc:
        db.session.add(
            UserCredit(
                id=u.id,
                plan=plan,
                chat_used=0,
                ocr_bill_used=0,
                ocr_bank_used=0,
                last_reset_at=now_ym(),
            )
        )
    else:
        if uc.plan != plan:
            uc.plan = plan
        if uc.last_reset_at != now_ym():
            uc.chat_used = 0; uc.ocr_bill_used = 0; uc.ocr_bank_used = 0; uc.last_reset_at = now_ym()
        uc.updated_at = datetime.utcnow()

    if not Chat.query.filter_by(user_id=u.id).first():
        db.session.add(Chat(user_id=u.id, title=first_chat_title))

    db.session.commit()
    return u

def _seed_notifications_for_user(user_id: int):
    existing = Notification.query.filter_by(user_id=user_id).count()
    if existing > 0:
        return
    now = datetime.utcnow()
    samples = [
        Notification(
            user_id=user_id,
            title="Welcome!",
            body="Thanks for joining JV System. Explore Chatbot, OCR and Vision AI from the sidebar.",
            created_at=now - timedelta(days=3),
        ),
        Notification(
            user_id=user_id,
            title="Your monthly counters were reset",
            body="Your chat/OCR counters were reset for the new billing cycle.",
            created_at=now - timedelta(days=2),
            read_at=now - timedelta(days=1, hours=20),
        ),
        Notification(
            user_id=user_id,
            title="Credit reminder",
            body="Heads up: you’ve used 80% of your Chat credits this month.",
            created_at=now - timedelta(hours=30),
        ),
        Notification(
            user_id=user_id,
            title="New promotion",
            body="Upgrade to Plus and get 20% off your first month. Contact sales from the Profile menu.",
            created_at=now - timedelta(hours=8),
        ),
    ]
    for n in samples:
        db.session.add(n)
    db.session.commit()

@app.get("/notifications/count")
def notifications_count():
    """Return total and unread counts for the current user."""
    current_user_required()
    total = Notification.query.filter_by(user_id=g.user.id).count()
    unread = Notification.query.filter_by(user_id=g.user.id, read_at=None).count()
    return jsonify({"total": total, "unread": unread})

def _require_admin():
    # very light check: plan == 'admin'
    u = current_user_required()
    uc = db.session.get(UserCredit, u.id)
    if not uc or (uc.plan or "free").lower() != "admin":
        abort(403)
    return u


@app.post("/admin/notify")
def admin_notify():
    """
    Admin-only broadcast/targeted notification.
    Body example:
    {
      "title": "Promo",
      "body": "20% off this month",
      "user_ids": [2,3],      # optional
      "plan": "plus"          # optional, one of: free|plus|business|admin
    }
    If neither user_ids nor plan are provided, notifies *all* users.
    """
    _require_admin()
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    body = (data.get("body") or "").strip()
    if not title:
        return jsonify({"error": "missing_title"}), 400

    user_ids = data.get("user_ids") or []
    plan = (data.get("plan") or "").strip().lower() or None

    q = User.query
    if user_ids:
        q = q.filter(User.id.in_(user_ids))
    elif plan:
        q = q.join(UserCredit, UserCredit.id == User.id).filter((UserCredit.plan or "free") == plan)
    # else: all users

    targets = q.all()
    if not targets:
        return jsonify({"ok": True, "created": 0})

    now = datetime.utcnow()
    for u in targets:
        db.session.add(Notification(user_id=u.id, title=title, body=body, created_at=now))
    db.session.commit()
    return jsonify({"ok": True, "created": len(targets)})



def ensure_baseline_notifications(user_id: int):
    """
    Guarantee a 'Welcome!' exists for the user, and add a couple of
    useful samples if the user has zero notifications.
    Safe to call multiple times.
    """
    has_any = Notification.query.filter_by(user_id=user_id).count() > 0
    has_welcome = Notification.query.filter_by(user_id=user_id, title="Welcome!").count() > 0

    if not has_welcome:
        db.session.add(Notification(
            user_id=user_id,
            title="Welcome!",
            body="Thanks for joining JV System. Explore Chatbot, OCR and Vision AI from the sidebar."
        ))
        db.session.commit()
        has_any = True

    if not has_any:
        # add a couple of extras only if totally empty
        now = datetime.utcnow()
        db.session.add_all([
            Notification(
                user_id=user_id,
                title="Getting started",
                body="Tip: open the sidebar → Chatbot to start a conversation.",
                created_at=now - timedelta(hours=6),
            ),
            Notification(
                user_id=user_id,
                title="What’s new",
                body="Vision AI now supports quick defect tagging. Try it from the Vision module.",
                created_at=now - timedelta(hours=3),
            ),
        ])
        db.session.commit()


def seed():
    db.create_all()
    auto_migrate()
    # Admin (unlimited)
    admin = _ensure_user("admin@example.com", "Admin", password="admin123", plan="admin", first_chat_title="Welcome")
    # Free
    free = _ensure_user("free@example.com", "Free User", password="free123", plan="free", first_chat_title="Welcome")
    # Plus
    plus = _ensure_user("plus@example.com", "Plus User", password="plus123", plan="plus", first_chat_title="Welcome")
    # Business (contract-based by default; you can set per-user overrides later)
    biz = _ensure_user("business@example.com", "Business User", password="biz123", plan="business", first_chat_title="Welcome")

    # Seed a few notifications for each demo user
    for u in (admin, free, plus, biz):
        _seed_notifications_for_user(u.id)


# ---------- Health ----------
@app.get("/health")
def health():
    return jsonify({"ok": True})


# ---------- Plan catalog (for UI cards) ----------
@app.get("/plans")
def plans_catalog():
    """
    Master plan catalog for the UI. Business is contract-based (None).
    """
    return jsonify({
        "plans": {
            "free":     {"chat": 100,  "bill": 3,   "bank": 3},
            "plus":     {"chat": 1000, "bill": 100, "bank": 100},
            "business": {"chat": None, "bill": None, "bank": None},
        }
    })


# ---------- Auth ----------
@app.post("/auth/signup")
def signup():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    pw = data.get("password") or ""
    name = (data.get("name") or email.split("@")[0] or "User").strip()
    if not email or not pw:
        return jsonify({"error": "missing_email_or_password"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "email_in_use"}), 409
    u = User(email=email, name=name, password_hash=generate_password_hash(pw))
    db.session.add(u); db.session.commit()
    db.session.add(Profile(id=u.id, full_name=u.name))
    db.session.add(UserCredit(id=u.id, plan="free", last_reset_at=now_ym()))
    db.session.commit()
    ensure_baseline_notifications(u.id)
    tok = secrets.token_hex(24)
    db.session.add(Session(token=tok, user_id=u.id)); db.session.commit()
    return jsonify({"user": u.to_dict(include_profile=True), "session": {"access_token": tok}})

@app.post("/auth/login")
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    pw = data.get("password") or ""
    u = User.query.filter_by(email=email).first()
    if not u or not check_password_hash(u.password_hash, pw):
        return jsonify({"error": "invalid_credentials"}), 401
    tok = secrets.token_hex(24)
    db.session.add(Session(token=tok, user_id=u.id)); db.session.commit()
    return jsonify({"token": tok, "user": u.to_dict(include_profile=True)})

@app.get("/auth/me")
def me():
    u = g.user
    return jsonify({"user": None if not u else u.to_dict(include_profile=True)})

@app.post("/auth/logout")
def logout():
    tok = request.headers.get("Authorization", "").replace("Bearer ", "")
    Session.query.filter_by(token=tok).delete()
    db.session.commit()
    return jsonify({"ok": True})

# NEW: change password
@app.post("/auth/change-password")
def change_password():
    u = current_user_required()
    data = request.get_json(silent=True) or {}
    old_pw = (data.get("old_password") or "").strip()
    new_pw = (data.get("new_password") or "").strip()
    if not old_pw or not new_pw:
        return jsonify({"error": "missing_fields"}), 400
    if not check_password_hash(u.password_hash, old_pw):
        return jsonify({"error": "old_password_incorrect"}), 400
    u.password_hash = generate_password_hash(new_pw)
    db.session.commit()
    return jsonify({"ok": True})


# ---------- Profile ----------
@app.get("/me")
def get_me():
    u = current_user_required()
    d = u.to_dict(include_profile=True)
    uc = load_or_create_credits(u.id)
    d["plan"] = uc.plan or "free"
    return jsonify(d)

@app.put("/me")
def update_me():
    u = current_user_required()
    data = request.get_json() or {}
    u.name = data.get("name", u.name)
    prof = db.session.get(Profile, u.id) or Profile(id=u.id)
    prof.full_name = data.get("full_name", prof.full_name)
    prof.avatar_url = data.get("avatar_url", prof.avatar_url)
    db.session.add(prof); db.session.commit()
    return jsonify(u.to_dict(include_profile=True))

# Aliases for UI flexibility
@app.get("/me/profile")
def me_profile_get():
    return get_me()

@app.patch("/me/profile")
def me_profile_patch():
    return update_me()


# ---------- Credits ----------
@app.post("/rpc/get_credits")
def rpc_get_credits():
    current_user_required()
    row = load_or_create_credits(g.user.id)
    db.session.commit()
    payload = credits_payload(row)
    # keep a simple numeric for legacy clients; use a large number for contract-based
    rem = payload["chat"]["remaining"]
    payload["remaining_simple"] = (rem if isinstance(rem, int) else 10_000_000)
    return jsonify({"data": {"credits": payload}})


# ---------- Chat function ----------
def _ensure_user_message_inserted(u, chat_id: int, text: str, version: str):
    c = db.session.get(Chat, int(chat_id))
    if not c or c.user_id != u.id:
        abort(404)
    m = Message(chat_id=int(chat_id), user_id=u.id,
                content_json={"role":"user","text":text,"version":version,"meta":{}})
    db.session.add(m); db.session.commit()
    socketio.emit("db_change", {"eventType":"INSERT","schema":"public","table":"messages","new":ser(m),"old":None})
    return m

@app.post("/functions/v1/<name>")
def functions_invoke(name):
    current_user_required()
    body = request.get_json(silent=True) or {}
    if name not in ("chat", "chat-router"):
        return jsonify({"data": {"ok": True}})

    version = (body.get("version") or "V2").upper()
    cost = CHAT_COST.get(version, 2)

    row = load_or_create_credits(g.user.id)
    lim = effective_limits(row)
    reset_month_if_needed(row)
    db.session.commit()

    # If chat limit is None => contract-based (no cap here)
    if lim["chat"] is not None:
        remaining = max(0, int(lim["chat"]) - (row.chat_used or 0))
        if remaining < cost:
            return jsonify({
                "errorCode": "INSUFFICIENT_CREDITS",
                "message": "Not enough credits",
                "data": {"credits": credits_payload(row)}
            }), 200

    chat_id = body.get("chat_id")
    text = body.get("text") or body.get("user_text") or ""
    if not chat_id:
        c = Chat(user_id=g.user.id, title="New Chat")
        db.session.add(c); db.session.commit()
        chat_id = c.id
    else:
        c = db.session.get(Chat, int(chat_id))
        if not c or c.user_id != g.user.id:
            abort(404)

    if text:
        _ensure_user_message_inserted(g.user, int(chat_id), text, version)

    label = "V1" if version=="V1" else "V3" if version=="V3" else "V2"
    reply = f"Temporary reply message from {label}"

    m = Message(chat_id=int(chat_id), user_id=g.user.id,
                content_json={"role":"assistant","text":reply,"version":version,"meta":{}})
    db.session.add(m)
    c.last_message = reply
    c.messages_count = (c.messages_count or 0) + 1
    c.updated_at = datetime.utcnow()

    row.chat_used = (row.chat_used or 0) + cost
    row.updated_at = datetime.utcnow()
    db.session.commit()

    socketio.emit("db_change", {"eventType":"INSERT","schema":"public","table":"messages","new":ser(m),"old":None})

    return jsonify({
        "data": {
            "choices": [{"message": {"role": "assistant", "content": reply}}],
            "chat_id": chat_id,
            "assistant": ser(m),
            "credits": credits_payload(row)
        }
    })


# ---------- Vision: OCR (mock extractors that charge monthly OCR credits) ----------
def _ocr_charge_and_payload(kind: str):
    """kind = 'bill' | 'bank'"""
    current_user_required()
    row = load_or_create_credits(g.user.id)
    reset_month_if_needed(row)
    limits = effective_limits(row)

    used_attr = "ocr_bill_used" if kind == "bill" else "ocr_bank_used"
    used = getattr(row, used_attr) or 0

    # If limit is None => contract-based (no cap); otherwise enforce
    limit = limits["bill"] if kind == "bill" else limits["bank"]
    if limit is not None:
        remaining = max(0, int(limit) - used)
        if remaining <= 0:
            return None, jsonify({
                "errorCode": "INSUFFICIENT_CREDITS",
                "message": "Not enough OCR credits",
                "data": {"credits": credits_payload(row)}
            }), 200

    setattr(row, used_attr, used + 1)
    row.updated_at = datetime.utcnow()
    db.session.commit()
    return row, None, None

@app.post("/vision/ocr/bill")
def vision_ocr_bill():
    row, err_resp, err_code = _ocr_charge_and_payload("bill")
    if err_resp is not None:
        return err_resp, err_code
    f = request.files.get("file")
    filename = getattr(f, "filename", None)
    fields = {
        "buyer_name_thai": "", "seller_name_thai": "", "doc_number": "",
        "doc_date": datetime.utcnow().strftime("%Y-%m-%d"),
        "currency": "THB", "sub_total": 0, "vat_percent": 7, "vat_amount": 0,
        "total_due_amount": 0, "table": [],
    }
    # ✅ remove the stray "}" before the final ")"
    return jsonify({"data": {"fields": fields, "filename": filename}, "credits": credits_payload(row)})

@app.post("/vision/ocr/bank")
def vision_ocr_bank():
    row, err_resp, err_code = _ocr_charge_and_payload("bank")
    if err_resp is not None:
        return err_resp, err_code
    f = request.files.get("file")
    filename = getattr(f, "filename", None)
    fields = {
        "account_number": "", "statement_period": "", "currency": "THB",
        "opening_balance": 0, "closing_balance": 0, "table": [],
    }
    return jsonify({"data": {"fields": fields, "filename": filename}, "credits": credits_payload(row)})

# ---------- OCR: unified history ----------
@app.get("/ocr/history")
def ocr_history():
    current_user_required()
    bills = OCRBillExtract.query.filter_by(user_id=g.user.id).all()
    banks = OCRBankExtract.query.filter_by(user_id=g.user.id).all()

    def shape(row, kind):
        d = ser(row)
        d["type"] = kind           # "bill" | "bank"
        d["id"] = row.id
        d["created_at"] = d.get("created_at")
        d["filename"] = d.get("filename") or d.get("file_name")
        d["file_url"] = d.get("file_url")
        d["approved"] = bool(d.get("approved", False))
        return d

    items = [shape(b, "bill") for b in bills] + [shape(b, "bank") for b in banks]
    items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return jsonify({"rows": items})


# ---------- Notifications (scoped + paginated) ----------
@app.get("/notifications")
def notifications_list():
    """List notifications for the current user with filters and pagination."""
    current_user_required()
    ensure_baseline_notifications(g.user.id)
    status = (request.args.get("status") or "all").lower()
    try:
        limit = max(1, min(100, int(request.args.get("limit", 20))))
    except Exception:
        limit = 20
    try:
        offset = max(0, int(request.args.get("offset", 0)))
    except Exception:
        offset = 0

    q = Notification.query.filter_by(user_id=g.user.id)

    if status == "unread":
        q = q.filter(Notification.read_at.is_(None))
    elif status == "read":
        q = q.filter(Notification.read_at.is_not(None))

    q = q.order_by(Notification.created_at.desc())
    rows = q.offset(offset).limit(limit).all()
    return jsonify({"rows": [ser(r) for r in rows]})


@app.post("/notifications/mark_read")
def notifications_mark_read():
    """Mark a notification as read for the current user."""
    current_user_required()
    data = request.get_json(silent=True) or {}
    nid = data.get("id")
    if not nid:
        return jsonify({"error": "missing_id"}), 400
    rec = db.session.get(Notification, int(nid))
    if not rec or rec.user_id != g.user.id:
        return jsonify({"error": "not_found"}), 404
    if rec.read_at is None:
        rec.read_at = datetime.utcnow()
        db.session.commit()
    return jsonify({"ok": True, "row": ser(rec)})


# (Kept for compatibility) ---------- Notifications generic ----------
@app.get("/db/notifications")
def list_notifications_legacy():
    current_user_required()
    rows = Notification.query.filter_by(user_id=g.user.id).order_by(Notification.created_at.desc()).all()
    return jsonify([ser(r) for r in rows])

@app.post("/db/notifications")
def create_notification_legacy():
    current_user_required()
    data = request.get_json() or {}
    n = Notification(user_id=g.user.id, title=data.get("title",""), body=data.get("body",""))
    db.session.add(n); db.session.commit()
    return jsonify(ser(n)), 201


# ---------- Generic DB (user-scoped where applicable) ----------
TABLES = {
    "users": User, "profiles": Profile, "user_credits": UserCredit,
    "chats": Chat, "messages": Message,
    "ocr_bill_extractions": OCRBillExtract, "ocr_bank_extractions": OCRBankExtract,
    "notifications": Notification,
}

def _has_user_id(Model): return "user_id" in model_columns(Model)

def _scope_query_to_user(Model, q):
    if _has_user_id(Model):
        current_user_required()
        q = q.filter(getattr(Model, "user_id") == g.user.id)
    return q

@app.get("/db/<table>")
def table_select(table):
    Model = TABLES.get(table)
    if not Model: return jsonify({"error":"unknown_table"}), 400
    args = request.args.to_dict()
    try:
        limit = int(args.pop("_limit", 0) or 0)
        offset = int(args.pop("_offset", 0) or 0)
    except ValueError:
        limit, offset = 0, 0
    order_col = args.pop("_order_col", None)
    order_asc = args.pop("_order_asc", "1") == "1"
    q = _scope_query_to_user(Model, Model.query)
    for k, v in args.items():
        if hasattr(Model, k): q = q.filter(getattr(Model, k) == v)
    if order_col and hasattr(Model, order_col):
        q = q.order_by(getattr(Model, order_col).asc() if order_asc else getattr(Model, order_col).desc())
    if offset: q = q.offset(offset)
    if limit: q = q.limit(limit)
    rows = q.all()
    return jsonify({"rows": [ser(r) for r in rows]})

@app.post("/db/<table>")
def table_insert(table):
    current_user_required()
    Model = TABLES.get(table)
    if not Model: return jsonify({"error":"unknown_table"}), 400
    body = request.get_json() or {}
    values = body.get("values")
    if values is None: return jsonify({"error":"missing_values"}), 400
    if isinstance(values, dict): values = [values]
    inserted=[]
    for row in values:
        clean = sanitize_row(Model, row)
        if _has_user_id(Model): clean["user_id"] = g.user.id
        if Model is Message:
            chat_id = int(clean.get("chat_id") or 0)
            chat = db.session.get(Chat, chat_id)
            if not chat or chat.user_id != g.user.id: abort(404)
            cj = clean.get("content_json")
            if isinstance(cj, str):
                try: clean["content_json"] = json.loads(cj)
                except Exception: clean["content_json"] = {"text": str(cj)}
        m = Model(**clean)
        db.session.add(m); inserted.append(m)
    db.session.commit()
    if Model is Message:
        for m in inserted:
          chat = db.session.get(Chat, m.chat_id)
          if chat:
            c = m.content_json; txt = (c.get("text") if isinstance(c, dict) else (c or "")) if c is not None else ""
            chat.last_message = txt
            chat.messages_count = (chat.messages_count or 0) + 1
            chat.updated_at = datetime.utcnow()
        db.session.commit()
        for m in inserted:
            socketio.emit("db_change", {"eventType":"INSERT","schema":"public","table":"messages","new":ser(m),"old":None})
    return jsonify({"rows": [ser(x) for x in inserted]}), 201

@app.patch("/db/<table>")
def table_update(table):
    current_user_required()
    Model = TABLES.get(table)
    if not Model: return jsonify({"error":"unknown_table"}), 400
    body = request.get_json() or {}
    values = body.get("values") or {}
    filters = body.get("filters") or {}
    q = _scope_query_to_user(Model, Model.query)
    for k, v in filters.items():
        if hasattr(Model, k): q = q.filter(getattr(Model, k) == v)
    rows = q.all()
    olds = [ser(r) for r in rows]
    cols = model_columns(Model)
    values.pop("user_id", None)
    if "content" in values and "content_json" in cols: values["content_json"] = values.pop("content")
    if "metadata" in values and "metadata_json" in cols: values["metadata_json"] = values.pop("metadata")
    if "data" in values and "data_json" in cols: values["data_json"] = values.pop("data")
    if "filename" in values and "filename" not in cols and "file_name" in cols: values["file_name"] = values.pop("filename")
    for r in rows:
        for k, v in values.items():
            if k in cols: setattr(r, k, v)
        if hasattr(r, "updated_at"): r.updated_at = datetime.utcnow()
    db.session.commit()
    for old, r in zip(olds, rows):
        socketio.emit("db_change", {"eventType":"UPDATE","schema":"public","table":table,"new":ser(r),"old":old})
    return jsonify({"rows": [ser(r) for r in rows]})

@app.delete("/db/<table>")
def table_delete(table):
    current_user_required()
    Model = TABLES.get(table)
    if not Model: return jsonify({"error":"unknown_table"}), 400
    args = request.args.to_dict()
    q = _scope_query_to_user(Model, Model.query)
    for k, v in args.items():
        if hasattr(Model, k): q = q.filter(getattr(Model, k) == v)
    rows = q.all()
    payload = [ser(r) for r in rows]
    for r in rows: db.session.delete(r)
    db.session.commit()
    for row in payload:
        socketio.emit("db_change", {"eventType":"DELETE","schema":"public","table":table,"new":None,"old":row})
    return jsonify({"rows": payload})


# ---------- Billing / Sales ----------
@app.post("/billing/upgrade-request")
def billing_upgrade_request():
    u = current_user_required()
    data = request.get_json(silent=True) or {}
    rec = SalesRequest(
        user_id=u.id,
        requested_plan=(data.get("plan") or "").lower() or None,
        name=data.get("name"), email=data.get("email"),
        phone=data.get("phone"), company=data.get("company"),
        location=data.get("location"), message=data.get("message"),
    )
    db.session.add(rec); db.session.commit()
    db.session.add(
        Notification(
            user_id=u.id,
            title="Upgrade request received",
            body=f"Plan: {rec.requested_plan or 'n/a'}",
        )
    ); db.session.commit()
    return jsonify({"ok": True})


# ---------- WebSocket ----------
@socketio.on("connect")
def ws_connect():
    emit("connected", {"ok": True})


# ---------- Main ----------
if __name__ == "__main__":
    with app.app_context():
        seed()
    print(f"Starting SocketIO server on http://localhost:{PORT} ...")
    socketio.run(app, host="0.0.0.0", port=PORT, debug=True, use_reloader=False)
