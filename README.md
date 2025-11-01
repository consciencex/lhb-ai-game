# DX Game – Collaborative AI Image Generation

This project modernises the original single-file proof of concept into a production-ready application that can be deployed to [Vercel](https://vercel.com/). It recreates the "DX Game" experience—four teams collaboratively describing sections of an image that Gemini 2.5 will synthesise—while adding proper application structure, Tailwind styling, and a secure serverless API proxy.

## Tech Stack

- [Next.js 14](https://nextjs.org/) with the App Router
- React 18 client components for the interactive game flow
- Tailwind CSS for styling and design tokens
- Serverless Route Handlers (`app/api/**/*`) for gameplay actions
- [Upstash Redis](https://upstash.com/) for persistent session storage that works on serverless platforms like Vercel

## Project Layout

- `app/page.tsx` – client UI for the game flow (start screen, prompts, results)
- `app/api/sessions/**` – serverless API routes for session management, player actions, and image generation
- `app/layout.tsx` & `app/globals.css` – shared layout, fonts, and global styles
- `tailwind.config.ts` & `postcss.config.mjs` – Tailwind configuration
- `lib/**` – core utilities for session management, image processing, and Gemini API integration

## Prerequisites

- Node.js 18.17 or newer
- A Google AI Studio **Gemini 2.5** API key with access to the `gemini-2.5-flash-image-preview` model
- An Upstash Redis database (free tier is sufficient) to persist host/player session data across serverless requests

## Local Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env.local` file based on `.env.example` and set your environment variables:

   ```bash
   cp .env.example .env.local
   # edit .env.local and set GEMINI_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
   ```

3. Run the dev server:

   ```bash
   npm run dev
   ```

4. Visit `http://localhost:3000` to play the game locally.

## Running Tests & Linting

The project uses Next.js' built-in ESLint configuration:

```bash
npm run lint
```

## Deployment to Vercel

1. Push the repository to GitHub (or GitLab/Bitbucket) connected to your Vercel account.
2. Create a new Vercel project and import the repository.
3. Set the following environment variables in **Project Settings → Environment Variables** (for Production, Preview, and Development as needed):
   - `GEMINI_API_KEY`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Trigger a deployment. Vercel will run `npm install`, `npm run build`, and `npm start` automatically.

Once deployed, the UI runs entirely on Vercel's edge-hosted Next.js application, while sensitive API access remains on the serverless function.

## Notes & Limitations

- The Gemini API currently expects the goal image as Base64-encoded JPEG data. Client uploads are converted before being sent to the serverless route.
- Route handlers inherit Vercel's body-size limits (approx. 4 MB). Consider resizing very large reference images before upload.
- Session data is kept in Upstash Redis with a 6-hour TTL. Hosts should re-create a room if they plan to keep a game open longer than that.
- Errors returned by the Gemini API are surfaced to users so they can adjust their descriptions or verify the API key configuration.

## Migrating From the Original POC

- All original inline HTML, CSS, and JavaScript has been translated to idiomatic React components inside `app/page.tsx`.
- Shared styling lives in Tailwind utility classes and a few custom global styles for animations/branding.
- The Google API key is now read from server-side environment variables, eliminating the need for players to paste sensitive credentials into the browser.

Enjoy building collaborative AI artwork with DX Game!

