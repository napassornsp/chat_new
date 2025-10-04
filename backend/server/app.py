# backend/server/app.py
import os, secrets, json
from datetime import datetime, timezone
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
    # New monthly counters / plan fields
    plan = db.Column(String, default="free")  # free | plus | business | admin
    chat_used = db.Column(Integer, default=0)
    ocr_bill_used = db.Column(Integer, default=0)
    ocr_bank_used = db.Column(Integer, default=0)
    last_reset_at = db.Column(String, nullable=True)  # ISO date string YYYY-MM
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)
    # legacy column (ignored by new code, kept for migration safety)
    credits = db.Column(Integer, default=0)

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

# ---------- Vision: Flower (YOLO-style dummy) ----------
@app.post("/vision/flower/detect")
def flower_detect():
    """
    Accepts multipart/form-data with 'file'.
    Returns YOLO-like dummy boxes for flowers so the frontend can render rectangles.
    """
    current_user_required()  # keep or stub, depending on your setup

    f = request.files.get("file")
    w, h = 640, 480
    try:
        if f is not None and Image is not None:
            im = Image.open(f.stream)
            w, h = im.size
    except Exception:
        pass

    boxes = [
        {"label": "Rose",      "conf": 0.95, "xyxy": [int(0.05*w), int(0.15*h), int(0.45*w), int(0.70*h)], "color": "#ef4444"},
        {"label": "Tulip",     "conf": 0.88, "xyxy": [int(0.55*w), int(0.25*h), int(0.90*w), int(0.70*h)], "color": "#22c55e"},
        {"label": "Sunflower", "conf": 0.82, "xyxy": [int(0.62*w), int(0.06*h), int(0.95*w), int(0.24*h)], "color": "#06b6d4"},
    ]
    return jsonify({"image": {"width": w, "height": h}, "boxes": boxes})


# ---------- Vision: Person (YOLO-style dummy) ----------
@app.post("/vision/person/detect")
def person_detect():
    """
    Accepts multipart/form-data with 'file'.
    Returns YOLO-like dummy boxes (person-safe, non-sensitive labels).
    """
    current_user_required()  # keep or stub depending on your setup

    f = request.files.get("file")
    w, h = 640, 480
    try:
        if f is not None and Image is not None:
            im = Image.open(f.stream)
            w, h = im.size
    except Exception:
        pass

    boxes = [
        # person 1
        {"label": "Person",     "conf": 0.97, "xyxy": [int(0.06*w), int(0.12*h), int(0.42*w), int(0.86*h)], "color": "#3b82f6"},
        # person 2
        {"label": "Person",     "conf": 0.94, "xyxy": [int(0.55*w), int(0.18*h), int(0.92*w), int(0.88*h)], "color": "#10b981"},
        # optional regions (non-sensitive)
        {"label": "Face",       "conf": 0.91, "xyxy": [int(0.16*w), int(0.18*h), int(0.28*w), int(0.34*h)], "color": "#f59e0b"},
        {"label": "Upper Body", "conf": 0.88, "xyxy": [int(0.62*w), int(0.36*h), int(0.88*w), int(0.70*h)], "color": "#ef4444"},
    ]
    return jsonify({"image": {"width": w, "height": h}, "boxes": boxes})

# ---------- Vision: Pet (YOLO-style dummy) ----------
@app.post("/vision/pet/detect")
def pet_detect():
    """
    Accepts multipart/form-data with 'file'.
    Returns YOLO-like dummy boxes for pets so the frontend can render rectangles.
    """
    current_user_required()  # keep/stub based on your setup

    f = request.files.get("file")
    w, h = 640, 480
    try:
        if f is not None and Image is not None:
            im = Image.open(f.stream)
            w, h = im.size
    except Exception:
        pass

    boxes = [
        # pet 1 (dog)
        {"label": "Dog",    "conf": 0.96, "xyxy": [int(0.08*w), int(0.45*h), int(0.52*w), int(0.92*h)], "color": "#10b981"},
        # pet 2 (cat)
        {"label": "Cat",    "conf": 0.92, "xyxy": [int(0.60*w), int(0.30*h), int(0.92*w), int(0.78*h)], "color": "#f59e0b"},
        # accessory/region (non-sensitive)
        {"label": "Collar", "conf": 0.85, "xyxy": [int(0.22*w), int(0.70*h), int(0.36*w), int(0.78*h)], "color": "#3b82f6"},
    ]
    return jsonify({"image": {"width": w, "height": h}, "boxes": boxes})


# ---------- Vision: Vehicle (YOLO-style dummy) ----------
@app.post("/vision/vehicle/detect")
def vehicle_detect():
    """
    Accepts multipart/form-data with 'file'.
    Returns YOLO-like dummy boxes for vehicles so the frontend can render rectangles.
    """
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
        {"label": "Vehicle: Car", "conf": 0.97, "xyxy": [int(0.06*w), int(0.40*h), int(0.60*w), int(0.88*h)], "color": "#ef4444"},
        {"label": "Vehicle: Truck", "conf": 0.90, "xyxy": [int(0.62*w), int(0.32*h), int(0.94*w), int(0.82*h)], "color": "#06b6d4"},
        {"label": "Wheel", "conf": 0.86, "xyxy": [int(0.20*w), int(0.78*h), int(0.30*w), int(0.90*h)], "color": "#22c55e"},
        {"label": "Headlight", "conf": 0.83, "xyxy": [int(0.50*w), int(0.52*h), int(0.58*w), int(0.60*h)], "color": "#f59e0b"},
    ]

    return jsonify({"image": {"width": w, "height": h}, "boxes": boxes})

# ---------- Vision: Food Classification (mock) ----------
@app.post("/vision/food/classify")
def vision_food_classify():
    """
    Mock classifier: returns a few food classes with confidences.
    Expects multipart/form-data with a 'file' field.
    """
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
    """
    Returns person-related classes with confidences.
    Expects multipart/form-data with a 'file' field.
    """
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
        # keep fallback size
        pass

    # Non-sensitive, safe labels
    classes = [
        {"label": "Person Detected",    "confidence": 0.98},
        {"label": "Frontal Face",       "confidence": 0.93},
        {"label": "Pose: Standing",     "confidence": 0.88},
        {"label": "Wearing Glasses",    "confidence": 0.67},
        {"label": "Upper Body Visible", "confidence": 0.81},
    ]

    payload = {
        "image": {"width": width, "height": height},
        "classes": classes,
        # You can change/add fields anytime; the Raw tab will show them
        "model": {"name": "mock-person-v1", "version": "1.0.0"},
        "meta": {"elapsed_ms": int((time.time() - t0) * 1000)},
    }
    return jsonify(payload), 200

# ---------- Vision: Pet Classification (mock) ----------
@app.post("/vision/pet/classify")
def vision_pet_classify():
    """
    Returns pet-related classes with confidences.
    Expects multipart/form-data with a 'file' field.
    """
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
        # Add whatever else you want; Raw tab will show it
        "model": {"name": "mock-pet-v1", "version": "1.0.0"},
        "meta": {"elapsed_ms": int((time.time() - t0) * 1000)},
    }
    return jsonify(payload), 200

# ---------- Vision: Vehicle Classification (backend is source of truth) ----------
@app.post("/vision/vehicle/classify")
def vision_vehicle_classify():
    """
    Returns vehicle-related classes with confidences.
    Expects multipart/form-data with a 'file' field.
    """
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
        pass  # keep fallback dimensions

    # Safe, non-PII labels; avoid plate numbers or personal identifiers
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
    db.session.commit()

# ---------- Plans / limits ----------
CHAT_COST = {"V1": 1, "V2": 2, "V3": 3}

def plan_limits(plan: str):
    p = (plan or "free").lower()
    if p == "plus":
        return {"chat": 500, "bill": 20, "bank": 20}
    if p == "business":
        return {"chat": 1000, "bill": 100, "bank": 100}
    if p == "admin":
        return {"chat": 10_000_000, "bill": 10_000_000, "bank": 10_000_000}
    return {"chat": 100, "bill": 3, "bank": 3}  # free

def reset_month_if_needed(row: UserCredit):
    ym = now_ym()
    if row.last_reset_at != ym:
        row.chat_used = 0
        row.ocr_bill_used = 0
        row.ocr_bank_used = 0
        row.last_reset_at = ym

def credits_payload(row: UserCredit):
    reset_month_if_needed(row)
    lim = plan_limits(row.plan)
    def pack(used, limit):
        used = int(used or 0)
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
        db.session.add(row)
        db.session.commit()
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
    """
    Create the user if missing and ensure related rows exist.
    Initialize UserCredit with a plan + monthly counters (not legacy numeric 'credits').
    """
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

def seed():
    db.create_all()
    auto_migrate()

    # Admin
    _ensure_user("admin@example.com","Admin",password="admin123",plan="admin",first_chat_title="Welcome")
    # Regular user
    _ensure_user("user@example.com","V1 User",password="user123",plan="free",first_chat_title="Welcome")

# ---------- Health ----------
@app.get("/health")
def health():
    return jsonify({"ok": True})

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

# ---------- Profile ----------
@app.get("/me")
def get_me():
    u = current_user_required()
    return jsonify(u.to_dict(include_profile=True))

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

# ---------- Credits ----------
@app.post("/rpc/get_credits")
def rpc_get_credits():
    current_user_required()
    row = load_or_create_credits(g.user.id)
    db.session.commit()
    payload = credits_payload(row)
    payload["remaining_simple"] = int(payload["chat"]["remaining"])
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
    lim = plan_limits(row.plan)
    reset_month_if_needed(row)
    db.session.commit()

    remaining = max(0, lim["chat"] - (row.chat_used or 0))
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
    limits = plan_limits(row.plan)

    used_attr = "ocr_bill_used" if kind == "bill" else "ocr_bank_used"
    used = getattr(row, used_attr) or 0
    limit = limits["bill"] if kind == "bill" else limits["bank"]
    remaining = max(0, limit - used)
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
        "buyer_name_thai": "",
        "seller_name_thai": "",
        "doc_number": "",
        "doc_date": datetime.utcnow().strftime("%Y-%m-%d"),
        "currency": "THB",
        "sub_total": 0,
        "vat_percent": 7,
        "vat_amount": 0,
        "total_due_amount": 0,
        "table": [],
    }

    return jsonify({
        "data": {"fields": fields, "filename": filename},
        "credits": credits_payload(row),
    })

@app.post("/vision/ocr/bank")
def vision_ocr_bank():
    row, err_resp, err_code = _ocr_charge_and_payload("bank")
    if err_resp is not None:
        return err_resp, err_code

    f = request.files.get("file")
    filename = getattr(f, "filename", None)

    fields = {
        "account_number": "",
        "statement_period": "",
        "currency": "THB",
        "opening_balance": 0,
        "closing_balance": 0,
        "table": [],
    }

    return jsonify({
        "data": {"fields": fields, "filename": filename},
        "credits": credits_payload(row),
    })


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


# ---------- Notifications (scoped) ----------
@app.get("/db/notifications")
def list_notifications():
    current_user_required()
    rows = Notification.query.filter_by(user_id=g.user.id).order_by(Notification.created_at.desc()).all()
    return jsonify([ser(r) for r in rows])

@app.post("/db/notifications")
def create_notification():
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
