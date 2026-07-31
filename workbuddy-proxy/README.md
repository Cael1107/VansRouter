# 🧠 WorkBuddy → FreeModel API Proxy

Proxy client untuk **FreeModel API** (`work.freemodel.dev`) yang menyamar sebagai
WorkBuddy AI, dengan **OpenAI-compatible Web API**.

Bisa dipakai sebagai **custom provider** di **OpenRouter**, **Open WebUI**,
**Cursor**, **ChatBox**, atau OpenAI-compatible client lainnya.

---

## ✨ Fitur

- ✅ **Dynamic API Key** — setiap client **WAJIB pakai API key sendiri**
- ✅ **OpenAI-compatible** — `POST /v1/chat/completions` + streaming SSE
- ✅ **Gate key** opsional untuk proteksi proxy pribadi
- ✅ Siap deploy ke **Railway** / **Render** / **VPS** (Docker)

---

## 🚀 Cara Pakai

### 1. Persiapan

```bash
# Install dependency
pip install -r requirements.txt

# Jalankan server lokal
uvicorn src.api:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Test API

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Authorization: Bearer fe_oa_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.6-sol",
    "messages": [{"role": "user", "content": "Halo!"}]
  }'
```

> 🔑 Ganti `fe_oa_xxx` dengan FreeModel API key kamu.
> Dapatkan di [work.freemodel.dev](https://work.freemodel.dev) → Settings.

### 3. Integrasi dengan OpenAI Client

| Parameter | Value |
|-----------|-------|
| **API URL** | `http://localhost:8000/v1` (lokal) |
|            | `https://app-mu.railway.app/v1` (deploy) |
| **API Key** | `fe_oa_xxx` (FreeModel key kamu) |
| **Model** | `gpt-5.6-sol` |

#### Contoh: Open WebUI

```
Settings → Connections → OpenAI:
  - API URL: https://app-mu.railway.app/v1
  - API Key: fe_oa_xxx
```

#### Contoh: OpenRouter (Custom Provider)

1. Dashboard → **Custom Providers** → **Add Custom Provider**
2. Isi:
   - **Name**: `WorkBuddy FreeModel`
   - **Base URL**: `https://app-mu.railway.app/v1`
   - **API Key**: `fe_oa_xxx`
3. Save → Model `gpt-5.6-sol` siap dipakai

---

## ☁️ Deploy ke Railway

### Via CLI (termudah)

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Dari folder proyek
railway init
railway up
railway domain
```

### Via Dashboard (Drag & Drop)

1. Buka [railway.app](https://railway.app)
2. **New Project** → **Empty Project**
3. **Add Service** → **Dockerfile**
4. **Drag & Drop** folder proyek ini
5. Deploy ✅

> Tidak perlu set env var apa pun — client kirim API key sendiri.

---

## 🔐 Environment Variables

| Variable | Wajib | Default | Deskripsi |
|----------|-------|---------|-----------|
| `API_KEY` | ❌ | — | Gate key. Jika diset, client kirim `Authorization: Bearer <API_KEY>` dan FreeModel key via header `X-FreeModel-API-Key` |
| `PORT` | ❌ | `8000` | Port server (Railway otomatis set) |

---

## 📁 Struktur Proyek

```
├── src/
│   ├── __init__.py        # Package init
│   ├── api.py             # 🔥 Web API (FastAPI)
│   ├── cli.py             # CLI client (opsional)
│   └── prompt.tpl         # Template prompt (wajib)
├── Dockerfile             # Build container
├── Procfile               # Railway start command
├── requirements.txt       # Python dependencies
├── runtime.txt            # Python version
├── .env.example           # Contoh env vars
├── .gitignore
└── README.md
```

---

## 🐟 Credit

Dibuat dengan ❤️ oleh **WorkBuddy FreeModel Proxy**

𓆝 𓆟 𓆞 𓆝 𓆟

---

## 📜 Lisensi

MIT — pakai, modifikasi, sharing bebas.
