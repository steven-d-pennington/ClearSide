# ClearSide Deployment Guide

This guide covers deploying ClearSide with the recommended stack:
- **Frontend**: Vercel
- **Backend**: Railway
- **Database**: Supabase PostgreSQL

---

## Prerequisites

- GitHub account (for CI/CD integration)
- [Vercel](https://vercel.com) account (free tier works)
- [Railway](https://railway.app) account (free tier: $5/month credit)
- [Supabase](https://supabase.com) account (free tier works)
- OpenAI or Anthropic API key

---

## Step 1: Set Up Supabase Database

### 1.1 Create Project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Choose a region close to your users
3. Set a strong database password (save this!)
4. Wait for project to initialize (~2 minutes)

### 1.2 Get Connection String
1. Go to **Project Settings** → **Database**
2. Find "Connection string" section
3. Copy the **URI** (not the pooler for now)
4. Replace `[YOUR-PASSWORD]` with your database password

Example:
```
postgresql://postgres.[project-ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

### 1.3 Run Migrations
You'll need to run the database migrations. You can do this locally:

```bash
cd backend
cp .env.example .env
# Edit .env and set DATABASE_URL to your Supabase connection string
npm install
npm run db:migrate
```

---

## Step 2: Deploy Backend to Railway

### 2.1 Create Railway Project
1. Go to [railway.app](https://railway.app)
2. Click **New Project** → **Deploy from GitHub repo**
3. Select the ClearSide repository
4. Railway will auto-detect the `backend` folder

### 2.2 Configure Root Directory
1. Go to **Settings** → **Root Directory**
2. Set to: `backend`

### 2.3 Set Environment Variables
Go to **Variables** tab and add:

| Variable | Value | Required |
|----------|-------|----------|
| `DATABASE_URL` | Your Supabase connection string | ✅ |
| `OPENAI_API_KEY` | Your OpenAI API key | ✅ (or ANTHROPIC_API_KEY) |
| `LLM_PROVIDER` | `openai` or `anthropic` | ✅ |
| `LLM_DEFAULT_MODEL` | `gpt-4` or `claude-3-sonnet-20240229` | ✅ |
| `NODE_ENV` | `production` | ✅ |
| `PORT` | `3001` | ✅ |
| `LOG_LEVEL` | `info` | Optional |
| `FRONTEND_URL` | Your Vercel URL (add after Step 3) | ✅ for production |

### 2.4 Deploy
Railway will automatically deploy. Check the **Deployments** tab for status.

### 2.5 Get Backend URL
Once deployed, go to **Settings** → **Networking** → **Generate Domain**

Your backend URL will look like:
```
https://clearside-backend-production.up.railway.app
```

Save this URL for the frontend configuration.

---

## Step 3: Deploy Frontend to Vercel

### 3.1 Import Project
1. Go to [vercel.com](https://vercel.com)
2. Click **Add New** → **Project**
3. Import the ClearSide repository

### 3.2 Configure Build Settings
| Setting | Value |
|---------|-------|
| Framework Preset | Vite |
| Root Directory | `frontend` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

### 3.3 Set Environment Variables
| Variable | Value |
|----------|-------|
| `VITE_API_URL` | Your Railway backend URL (from Step 2.5) |

### 3.4 Deploy
Click **Deploy** and wait for the build to complete.

### 3.5 Get Frontend URL
Your frontend will be available at:
```
https://clearside.vercel.app
```
(or your custom domain)

---

## Step 4: Connect Frontend and Backend

### 4.1 Update Backend CORS
Go back to Railway and add/update the environment variable:

| Variable | Value |
|----------|-------|
| `FRONTEND_URL` | `https://clearside.vercel.app` (your Vercel URL) |

Railway will automatically redeploy.

---

## Verification

### Test the Deployment

1. **Health Check**: Visit `https://your-backend.up.railway.app/health`
   - Should return: `{"status":"ok",...}`

2. **Frontend**: Visit your Vercel URL
   - Should load the ClearSide interface

3. **Full Test**: Submit a proposition and watch a debate generate

---

## Troubleshooting

### Backend won't start
- Check Railway logs for errors
- Verify `DATABASE_URL` is correct
- Ensure database migrations ran successfully

### CORS errors in browser
- Verify `FRONTEND_URL` is set correctly in Railway
- Check it matches your Vercel URL exactly (including https://)

### Database connection errors
- Check Supabase is not paused (free tier pauses after 1 week of inactivity)
- Verify connection string includes password
- Try the connection pooler URL if direct connection fails

### LLM errors
- Verify API key is correct
- Check you have credits/quota available
- Ensure `LLM_PROVIDER` matches the API key type

---

## Cost Estimates (Free Tiers)

| Service | Free Tier | Limits |
|---------|-----------|--------|
| **Vercel** | Yes | 100GB bandwidth/month |
| **Railway** | $5 credit/month | ~500 hours of runtime |
| **Supabase** | Yes | 500MB database, pauses after inactivity |
| **OpenAI** | No | Pay per token (~$0.01-0.03 per debate) |
| **Anthropic** | No | Pay per token (~$0.01-0.02 per debate) |

**Estimated cost per debate**: $0.01-0.05 (LLM tokens only)

---

## Production Checklist

- [ ] Database migrations applied
- [ ] Backend health check passing
- [ ] Frontend loading correctly
- [ ] CORS configured (no console errors)
- [ ] Test debate runs successfully
- [ ] Custom domain configured (optional)
- [ ] Error tracking enabled (Sentry - optional)

---

## Custom Domain Setup

### Vercel (Frontend)
1. Go to **Settings** → **Domains**
2. Add your domain
3. Update DNS as instructed

### Railway (Backend)
1. Go to **Settings** → **Networking**
2. Add custom domain
3. Update DNS as instructed

Remember to update `FRONTEND_URL` in Railway if you change the frontend domain!

---

*Last updated: 2025-12-24*
