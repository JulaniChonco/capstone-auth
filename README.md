# Capstone Project 07-015 – Authentication

## Structure
- `/backend` → Express + MongoDB + Mongoose (register/login + JWT)
- `/frontend` → React app with simple forms for register/login

## How to run

### Backend
```bash
cd backend
npm install
cp .env.example .env   # update Mongo URI + JWT_SECRET
npm run dev            # start with nodemon
```

Backend runs on http://localhost:8000

### Frontend
```bash
cd frontend
npm install
npm start
```

Frontend runs on http://localhost:3000 and communicates with backend.

## Features (Task 1)
- MongoDB models for Users, OUs, Divisions, Credential Repositories
- Sample OU + Division seeded on first run
- POST /api/register → create user (default role: normal) + return JWT
- POST /api/login → authenticate and return JWT
- React frontend with forms for Register + Login, feedback displayed

---
Proceed to **Compulsory Task 2** by adding endpoints for viewing/adding/updating credentials, with JWT verification and permission checks.
