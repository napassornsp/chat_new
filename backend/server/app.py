import os, secrets, json
from datetime import datetime
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import Integer, String, Text, text
from sqlalchemy.dialects.sqlite import JSON as SQLITE_JSON  # JSON-like on SQLite

# ------------------ Config ------------------
DB_URL = os.environ.get("OFFLINE_DB_URL", "sqlite:///offline.db")
SECRET = os.environ.get("OFFLINE_SECRET", "dev-secret")
PORT = int(os.environ.get("PORT", "5001"))

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = DB_URL
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = SECRET

# Open CORS for dev (Bearer tokens only; no cookies)
CORS(
    app,
    resources={r"/*": {"origins": "*"}},
    supports_credentials=False,
    methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

db = SQLAlchemy(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# ------------------ Models ------------------
class User(db.Model):
    __tablename__ = "users"
    id = db.Column(Integer, primary_key=True)
    email = db.Column(String, unique=True, nullable=False)
    name = db.Column(String, nullable=False)
    password_hash = db.Column(String, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Profile(db.Model):
    __tablename__ = "profiles"
    id = db.Column(Integer, primary_key=True)  # same as users.id
    full_name = db.Column(String, nullable=True)
    avatar_url = db.Column(String, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class UserCredit(db.Model):
    __tablename__ = "user_credits"
    id = db.Column(Integer, primary_key=True)  # same as users.id
    credits = db.Column(Integer, default=1000)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)


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
    # stores dict like {"role":"user|assistant","text":"...","version":"V1|V2|V3","meta":{}}
    content_json = db.Column(SQLITE_JSON, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class OCRBillExtract(db.Model):
    __tablename__ = "ocr_bill_extractions"
    id = db.Column(Integer, primary_key=True)
    user_id = db.Column(Integer, db.ForeignKey("users.id"), nullable=True)
    file_name = db.Column(String, nullable=True)
    text = db.Column(Text, nullable=True)
    metadata_json = db.Column(SQLITE_JSON, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class OCRBankExtract(db.Model):
    __tablename__ = "ocr_bank_extractions"
    id = db.Column(Integer, primary_key=True)
    user_id = db.Column(Integer, db.ForeignKey("users.id"), nullable=True)
    file_name = db.Column(String, nullable=True)
    text = db.Column(Text, nullable=True)
    metadata_json = db.Column(SQLITE_JSON, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Session(db.Model):
    __tablename__ = "sessions"
    token = db.Column(String, primary_key=True)
    user_id = db.Column(Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


# ------------------ Helpers ------------------
def ser(o):
    """Serialize SQLAlchemy model to plain dict; lift content_json.role to top-level 'role'."""
    d = {c.name: getattr(o, c.name) for c in o.__table__.columns}
    for k, v in list(d.items()):
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    if "content_json" in d:
        cj = d.pop("content_json")
        if isinstance(cj, str):
            try:
                cj = json.loads(cj)
            except Exception:
                cj = {"text": str(cj)}
        d["content"] = cj
        # Provide role at top level to make UI bubble placement consistent
        if isinstance(cj, dict) and "role" in cj and "role" not in d:
            d["role"] = cj["role"]
    if "metadata_json" in d:
        d["metadata"] = d.pop("metadata_json")
    return d


def model_columns(Model):
    return {c.name for c in Model.__table__.columns}


def sanitize_row(Model, row: dict):
    row = dict(row or {})
    cols = model_columns(Model)
    if "content" in row and "content_json" in cols and "content_json" not in row:
        row["content_json"] = row.pop("content")
    if "metadata" in row and "metadata_json" in cols and "metadata_json" not in row:
        row["metadata_json"] = row.pop("metadata")
    return {k: v for k, v in row.items() if k in cols}


def current_user():
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        return None
    sess = Session.query.filter_by(token=token).first()
    return db.session.get(User, sess.user_id) if sess else None


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


# ------------------ DB init + auto-migration ------------------
def column_exists(table: str, column: str) -> bool:
    rows = db.session.execute(text(f"PRAGMA table_info({table})")).mappings().all()
    return any(r["name"] == column for r in rows)


def auto_migrate():
    # messages.content_json backfill (from old 'content' TEXT)
    if column_exists("messages", "id") and not column_exists("messages", "content_json"):
        db.session.execute(text("ALTER TABLE messages ADD COLUMN content_json TEXT"))
        db.session.commit()
        if column_exists("messages", "content"):
            for row in db.session.execute(text("SELECT id, content FROM messages")).mappings():
                payload = {"text": row["content"]} if row["content"] is not None else {}
                db.session.execute(
                    text("UPDATE messages SET content_json = :p WHERE id = :i"),
                    {"p": json.dumps(payload, ensure_ascii=False), "i": row["id"]},
                )
            db.session.commit()

    # ensure OCR tables have metadata_json
    for t in ("ocr_bill_extractions", "ocr_bank_extractions"):
        if column_exists(t, "id") and not column_exists(t, "metadata_json"):
            db.session.execute(text(f"ALTER TABLE {t} ADD COLUMN metadata_json TEXT"))
            db.session.commit()


def _ensure_user(email, name, password="demo123", credits=1000, first_chat_title="General"):
    u = User.query.filter_by(email=email).first()
    if not u:
        u = User(email=email, name=name, password_hash=generate_password_hash(password))
        db.session.add(u)
        db.session.commit()
        db.session.add(Profile(id=u.id, full_name=u.name))
        db.session.add(UserCredit(id=u.id, credits=credits))
        db.session.add(Chat(user_id=u.id, title=first_chat_title))
        db.session.commit()
    return u


def seed():
    db.create_all()
    auto_migrate()

    _ensure_user("admin@example.com", "Admin", password="admin123", credits=1000)
    _ensure_user("v1@example.com", "V1 User", password="admin123", credits=100)
    _ensure_user("v2@example.com", "V2 User", password="admin123", credits=100)
    _ensure_user("v3@example.com", "V3 User", password="admin123", credits=100)

# ------------------ Health ------------------
@app.get("/health")
def health():
    return jsonify({"ok": True})


# ------------------ Auth ------------------
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
    db.session.add(u)
    db.session.commit()
    db.session.add(Profile(id=u.id, full_name=u.name))
    db.session.add(UserCredit(id=u.id, credits=1000))
    db.session.commit()
    tok = secrets.token_hex(24)
    db.session.add(Session(token=tok, user_id=u.id))
    db.session.commit()
    return jsonify(
        {"user": {"id": u.id, "email": u.email, "name": u.name}, "session": {"access_token": tok}}
    )


@app.post("/auth/login")
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    pw = data.get("password") or ""
    u = User.query.filter_by(email=email).first()
    if not u or not check_password_hash(u.password_hash, pw):
        return jsonify({"error": "invalid_credentials"}), 401
    tok = secrets.token_hex(24)
    db.session.add(Session(token=tok, user_id=u.id))
    db.session.commit()
    return jsonify({"token": tok, "user": {"id": u.id, "email": u.email, "name": u.name}})


@app.get("/auth/me")
def me():
    u = current_user()
    return jsonify({"user": None if not u else {"id": u.id, "email": u.email, "name": u.name}})


@app.post("/auth/logout")
def logout():
    tok = request.headers.get("Authorization", "").replace("Bearer ", "")
    Session.query.filter_by(token=tok).delete()
    db.session.commit()
    return jsonify({"ok": True})


# ------------------ RPC: credits ------------------
def _credits_payload(user_id: int):
    row = db.session.get(UserCredit, user_id)
    if not row:
        row = UserCredit(id=user_id, credits=1000)
        db.session.add(row)
        db.session.commit()
    return {"remaining": int(row.credits or 0)}


@app.post("/rpc/get_credits")
def rpc_get_credits():
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    return jsonify({"data": {"credits": _credits_payload(u.id)}})


@app.post("/rpc/reset_monthly_credits")
def rpc_reset_monthly_credits():
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    row = db.session.get(UserCredit, u.id)
    if not row:
        row = UserCredit(id=u.id, credits=1000)
        db.session.add(row)
    else:
        row.credits = 1000
        row.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"data": {"ok": True, "credits": _credits_payload(u.id)}})


# ------------------ Functions (chat + router) ------------------
def _ensure_user_message_inserted(u, chat_id: int, text: str, version: str = "V2"):
    m = Message(
        chat_id=int(chat_id),
        user_id=u.id,
        content_json={"role": "user", "text": text, "version": version, "meta": {}},
    )
    db.session.add(m)
    db.session.commit()
    socketio.emit(
        "db_change",
        {"eventType": "INSERT", "schema": "public", "table": "messages", "new": ser(m), "old": None},
    )
    return m


@app.post("/functions/v1/<name>")
def functions_invoke(name):
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401

    body = request.get_json(silent=True) or {}
    if name in ("chat", "chat-router"):
        chat_id = body.get("chat_id")
        version = (body.get("version") or "V2").upper()

        # --- Credits check FIRST ---
        credits_row = db.session.get(UserCredit, u.id)
        if not credits_row:
            credits_row = UserCredit(id=u.id, credits=1000)
            db.session.add(credits_row)
            db.session.commit()

        if (credits_row.credits or 0) <= 0:
            # block and let UI show a notice box
            return jsonify(
                {
                    "errorCode": "INSUFFICIENT_CREDITS",
                    "message": "Not enough credits",
                    "data": {"credits": {"remaining": int(credits_row.credits or 0)}},
                }
            )

        # last user text (optional – UI may also insert the user msg)
        last_text = body.get("text") or body.get("user_text") or ""
        if not chat_id:
            chat = Chat(user_id=u.id, title="New Chat")
            db.session.add(chat)
            db.session.commit()
            chat_id = chat.id

        if last_text:
            _ensure_user_message_inserted(u, int(chat_id), last_text, version)

        # --- version-specific temporary reply ---
        label = "V1" if version == "V1" else "V3" if version == "V3" else "V2"
        reply = f"Temporary reply message from {label}"

        # Insert assistant message
        m = Message(
            chat_id=int(chat_id),
            user_id=u.id,
            content_json={"role": "assistant", "text": reply, "version": version, "meta": {}},
        )
        db.session.add(m)

        chat = db.session.get(Chat, int(chat_id))
        if chat:
            chat.last_message = reply
            chat.messages_count = (chat.messages_count or 0) + 1
            chat.updated_at = datetime.utcnow()

        # Decrement 1 credit
        credits_row.credits = max(0, (credits_row.credits or 0) - 1)
        credits_row.updated_at = datetime.utcnow()
        db.session.commit()

        socketio.emit(
            "db_change",
            {"eventType": "INSERT", "schema": "public", "table": "messages", "new": ser(m), "old": None},
        )

        return jsonify(
            {
                "data": {
                    "choices": [{"message": {"role": "assistant", "content": reply}}],
                    "chat_id": chat_id,
                    # send numeric credits for convenience (frontend can coerce)
                    "credits": int(credits_row.credits or 0),
                    # also return the full assistant row for immediate render
                    "assistant": ser(m),
                }
            }
        )

    return jsonify({"data": {"ok": True}})


# ------------------ DB endpoints ------------------
TABLES = {
    "users": User,
    "profiles": Profile,
    "user_credits": UserCredit,
    "chats": Chat,
    "messages": Message,
    "ocr_bill_extractions": OCRBillExtract,
    "ocr_bank_extractions": OCRBankExtract,
}


@app.get("/db/<table>")
def table_select(table):
    Model = TABLES.get(table)
    if not Model:
        return jsonify({"error": "unknown_table"}), 400

    args = request.args.to_dict()
    try:
        limit = int(args.pop("_limit", 0) or 0)
        offset = int(args.pop("_offset", 0) or 0)
    except ValueError:
        limit, offset = 0, 0

    order_col = args.pop("_order_col", None)
    order_asc = args.pop("_order_asc", "1") == "1"

    q = Model.query
    for k, v in args.items():
        if hasattr(Model, k):
            q = q.filter(getattr(Model, k) == v)

    if order_col and hasattr(Model, order_col):
        q = q.order_by(
            getattr(Model, order_col).asc() if order_asc else getattr(Model, order_col).desc()
        )
    if offset:
        q = q.offset(offset)
    if limit:
        q = q.limit(limit)

    rows = q.all()
    return jsonify({"rows": [ser(r) for r in rows]})


@app.post("/db/<table>")
def table_insert(table):
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    Model = TABLES.get(table)
    if not Model:
        return jsonify({"error": "unknown_table"}), 400

    body = request.get_json() or {}
    values = body.get("values")
    if values is None:
        return jsonify({"error": "missing_values"}), 400
    if isinstance(values, dict):
        values = [values]

    inserted = []
    for row in values:
        clean = sanitize_row(Model, row)
        if Model is Message and isinstance(clean.get("content_json"), str):
            try:
                clean["content_json"] = json.loads(clean["content_json"])
            except Exception:
                clean["content_json"] = {"text": str(clean["content_json"])}
        m = Model(**clean)
        db.session.add(m)
        inserted.append(m)

    db.session.commit()

    if table == "messages":
        for m in inserted:
            chat = db.session.get(Chat, m.chat_id)
            if chat:
                c = m.content_json
                txt = (c.get("text") if isinstance(c, dict) else (c or "")) if c is not None else ""
                chat.last_message = txt
                chat.messages_count = (chat.messages_count or 0) + 1
                chat.updated_at = datetime.utcnow()
        db.session.commit()
        for m in inserted:
            socketio.emit(
                "db_change",
                {
                    "eventType": "INSERT",
                    "schema": "public",
                    "table": "messages",
                    "new": ser(m),
                    "old": None,
                },
            )

    return jsonify({"rows": [ser(x) for x in inserted]})


@app.patch("/db/<table>")
def table_update(table):
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    Model = TABLES.get(table)
    if not Model:
        return jsonify({"error": "unknown_table"}), 400

    body = request.get_json() or {}
    values = body.get("values") or {}
    filters = body.get("filters") or {}

    q = Model.query
    for k, v in filters.items():
        if hasattr(Model, k):
            q = q.filter(getattr(Model, k) == v)

    rows = q.all()
    olds = [ser(r) for r in rows]  # capture before updates
    cols = model_columns(Model)
    if "content" in values and "content_json" in cols:
        values["content_json"] = values.pop("content")
    if "metadata" in values and "metadata_json" in cols:
        values["metadata_json"] = values.pop("metadata")

    for r in rows:
        for k, v in values.items():
            if k in cols:
                setattr(r, k, v)
        if hasattr(r, "updated_at"):
            r.updated_at = datetime.utcnow()

    db.session.commit()

    # Realtime notify UPDATE (fixes rename without refresh)
    for old, r in zip(olds, rows):
        socketio.emit(
            "db_change",
            {"eventType": "UPDATE", "schema": "public", "table": table, "new": ser(r), "old": old},
        )

    return jsonify({"rows": [ser(r) for r in rows]})


@app.delete("/db/<table>")
def table_delete(table):
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    Model = TABLES.get(table)
    if not Model:
        return jsonify({"error": "unknown_table"}), 400

    args = request.args.to_dict()
    q = Model.query
    for k, v in args.items():
        if hasattr(Model, k):
            q = q.filter(getattr(Model, k) == v)

    rows = q.all()
    payload = [ser(r) for r in rows]
    for r in rows:
        db.session.delete(r)
    db.session.commit()

    for row in payload:
        socketio.emit(
            "db_change",
            {"eventType": "DELETE", "schema": "public", "table": table, "new": None, "old": row},
        )

    return jsonify({"rows": payload})


# ------------------ WebSocket ------------------
@socketio.on("connect")
def ws_connect():
    emit("connected", {"ok": True})


# ------------------ Main ------------------
if __name__ == "__main__":
    with app.app_context():
        seed()
    print(f"Starting SocketIO server on http://localhost:{PORT} ...")
    socketio.run(app, host="0.0.0.0", port=PORT, debug=True, use_reloader=False)
