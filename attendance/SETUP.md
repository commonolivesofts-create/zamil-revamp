# Attendance System: setup for a new machine

The Attendance System (Zamil Digitalization → Human resources → Attendance System) is the
React + Node app in this folder. Web: http://localhost:7388, API: :7387.

After `git pull` you need **one install command**. Everything else is automatic.

## Before you start

You need the normal Zamil Digitalization setup to work already:

- `server/.env` holds the test ADW credentials;
- the wallet is in `secrets/oracle/Wallet_zpadwtest`;
- `cd client; npm run dev` starts Zamil.

See [docs/DEVELOPER-ONBOARDING.md](../docs/DEVELOPER-ONBOARDING.md).

## Steps

1. Install the attendance packages (once, and again whenever `attendance/package-lock.json` changes):

   ```powershell
   cd attendance
   npm install
   ```

2. Show the sidebar link. Add this line to `client/.env` (git-ignored, so `git pull` does not bring
   it). Without it the **Attendance System** menu entry is hidden:

   ```
   VITE_EXTERNAL_ATTENDANCE_SYSTEM=http://localhost:7388/
   ```

3. Start everything as usual:

   ```powershell
   cd client
   npm run dev
   ```

   On the first run this does two things:
   - creates `attendance/.env` (git-ignored) with a random session secret;
   - copies the ADW credentials from `server/.env`.

4. Sign in to Zamil at http://localhost:7382 and open **Human resources → Attendance System**.
   Use `localhost`, not `127.0.0.1`, so the sign-in cookie is shared.

## EBS pages (optional)

Daily Attendance, Manager View and the three Contractor pages read Oracle EBS. If those pages show
"connect to the VPN", you need both of these:

- **Be on the Zamil VPN or in the office.**
- **Have the EBS connection values in `attendance/.env`:** `EBS_DB_HOST`, `EBS_DB_PORT`,
  `EBS_DB_SID`, `EBS_DB_USERNAME` and `EBS_DB_PASSWORD`. Ask the team lead for them. Never commit
  them. Restart `npm run dev` after editing the file.

All other pages work without EBS.

## Troubleshooting

| Problem                                                  | Fix                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| The `npm run dev` log says "Attendance is not installed" | Run step 1.                                                                                                              |
| No "Attendance System" menu entry                        | Do step 2 and restart `npm run dev`.                                                                                     |
| The page is blank or keeps sending you to the login page | Open Zamil and the attendance app on `localhost`, and make sure Zamil is signed in.                                      |
| ADW errors at start-up                                   | Check `server/.env` and the wallet folder, then delete `attendance/.env` and run `npm run dev` again so it is recreated. |
| Port 7387 or 7388 is busy                                | Stop the old `npm run dev` window.                                                                                       |

## Run it on its own, or run the checks

```powershell
cd attendance
npm run dev                                         # attendance only
npm run lint; npm run typecheck; npm test; npm run build
```

The old CodeIgniter app (`zamil-attendance/`) is frozen and **not needed**. It is only for parity
checks; its setup is in [zamil-attendance/README_LOCAL_SETUP.md](../zamil-attendance/README_LOCAL_SETUP.md).
