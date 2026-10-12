# VC Spinner

A small website for a monthly committee (VC / BC / rotating savings group). Every share pays a fixed amount each month, and each month's total is split between that month's winners. A spinner wheel picks the winners. Every share wins exactly once.

- **Shares:** someone who pays twice has 2 shares, so they get two slices on the wheel and win twice.
- **Started midway:** shares that were already opened before you used this app are marked as "opened before" and stay off the wheel.
- **Winners per month:** set it to 2, and each month has two spins by two different spinners, each with their own password.

## How a month works

1. **Admin** opens `/admin`. For each spin this month, pick the spinner (or press **Pick at random**) and click **Open spin and make password**. Send the password to that person with **Send on WhatsApp**.
2. **Each spinner** opens the site, enters their password and presses **Spin**. Anyone else with the page open watches the wheel spin live.
3. The winner card appears. Press **Share on WhatsApp** to post the result to the group.
4. The winning share leaves the wheel and that password stops working. When all of the month's spins are done, the page moves to the next month.

Fairness:
- The **server** picks the winner using a cryptographic random number. Every share still waiting is one ticket. The wheel only animates the result, so nobody can rig it from their browser.
- A spin locks after 10 wrong passwords. The admin can make a new password to unlock it.
- If a draw was a mistake, the admin can **undo** the last draw.

## Setting up the group

In `/admin` → **Group settings**:

- **Each share pays per month**, e.g. 2000.
- **Winners each month**, e.g. 2.
- **First draw in this app**: the month of your next draw.
- **Members**: open **Fill from a pasted list** and paste two lists, one name per line. Put "not opened yet" names in the first box and "already opened" names in the second. Write a name twice if that person has 2 shares. Then press **Replace the members list** and **Save settings**.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then set ADMIN_PASSWORD in .env.local
npm run dev
```

Open http://localhost:3000 for the draw page and http://localhost:3000/admin for admin.
Without Redis settings, data is saved to `.data/state.json`. Delete that folder to start fresh.

## Deploy to Vercel

1. On [vercel.com/new](https://vercel.com/new), import this GitHub repository and click **Deploy**. Next.js is detected automatically.
2. In the Vercel project, open **Storage** → **Create Database** → **Upstash for Redis**. The free plan is plenty. Connect it to this project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` for you.
3. Open **Settings** → **Environment Variables** and add `ADMIN_PASSWORD`.
4. Go to **Deployments**, open the latest one and choose **Redeploy** so the new settings take effect.
5. Visit `https://<your-site>.vercel.app/admin`, log in and set up the group as described above.

Share the main link (without `/admin`) with the group.

## Project layout

| Path | What it does |
| --- | --- |
| `app/page.tsx`, `components/Home.tsx` | Public draw page: wheel, this month's spins, history |
| `components/Wheel.tsx` | The SVG spinner wheel |
| `app/admin/page.tsx`, `components/Admin.tsx` | Admin page |
| `app/api/spin/route.ts` | Checks a spin password and picks the winner |
| `app/api/admin/*` | Admin login and actions |
| `lib/committee.ts` | Shares, months and amounts (shared by server and browser) |
| `lib/actions.ts` | Admin actions and their checks |
| `lib/store.ts` | Saves data to Upstash Redis, or a local file in development |
