# Zamil Attendance System — local setup

CodeIgniter 3.1.13 application (PHP + Oracle). In Zamil Digitalization it opens from
**Human resources → Attendance System** and signs users in with the Zamil session (no separate
login), the same way TrainingHub and ExpenseHub do.

## Databases

| CI3 group | What | Local / development target |
|---|---|---|
| `default` | Oracle ADW, schema `XXZP`: employees (`XX_DIGI_EMP_MASTER`), shifts, timetables, attendance sheet/card, occasions, payroll adjustments | Zamil Revamp **TEST** ADW (`zpadwtest`, wallet `../secrets/oracle/Wallet_zpadwtest`), never production |
| `ebs` | Oracle E-Business Suite on-prem DB: biometric punches (`ZPI.ICLOCK_TRANSACTION`, `ZPI.PERSONNEL_EMPLOYEE`, `ZPI.ATT_PAYLOADBASE`, `ZPI.XX_TIMETABLE`) and contractor master data (`XXZP.XX_CONTRACTOR_INFO`, `XXZP.XX_CON_EMPLOYEE_INFO`) | Reachable only on the Zamil network/VPN |

All credentials are read from `.env` (git-ignored). Template: [`.env.example`](.env.example).

## One-time setup (Windows + XAMPP)

1. **Oracle driver for PHP.** XAMPP's PHP has no Oracle support out of the box.
   - Oracle Instant Client (Basic Light) unzipped to `C:\oracle\instantclient_23_0`.
   - `php_oci8_19.dll` from PECL `oci8` 3.4.1 (`8.5-ts-vs17-x64` for PHP 8.5 ZTS x64) copied to
     `C:\xampp\php\ext\`, enabled with `extension=oci8_19` in `C:\xampp\php\php.ini`.
   - `C:\xampp\apache\conf\extra\httpd-xampp.conf` preloads the client before the PHP module, so
     Apache works without any PATH change:
     `LoadFile "C:/oracle/instantclient_23_0/oci.dll"`.
   - For PHP CLI, `C:\oracle\instantclient_23_0` is on the user PATH (new terminals).
2. **Serve it from htdocs** (directory junction, no admin rights needed):
   ```powershell
   New-Item -ItemType Junction -Path C:\xampp\htdocs\zamil-attendance -Target <repo>\zamil-attendance
   ```
3. **Configure** `cp .env.example .env` and fill in `ADW_PASSWORD` (same XXZP test user as
   `server/.env`), the EBS values, and a random `CI_ENCRYPTION_KEY`.
4. **Restart Apache** in the XAMPP Control Panel (it re-reads `php.ini` and `httpd-xampp.conf`).

Check: `http://localhost/zamil-attendance/` redirects to the Zamil login when you are signed out.

## Single sign-on

- Zamil Digitalization must run (`server` on :7381, `client` on :7382) and be opened on the **same
  hostname** as the attendance app (`localhost`, not `127.0.0.1`). Browsers share cookies across ports
  of one hostname, so the HttpOnly Zamil cookie (`zr_session` / `__Host-zr_session`) reaches Apache.
- `MY_Controller` forwards that cookie server-side to `GET {ZAMIL_AUTH_API_BASE_URL}/auth/me`, maps the
  returned employee number to `XX_DIGI_EMP_MASTER.USER_ID`, and stores it in the attendance session
  (`zatt_session`) as `FormsSession`. The Zamil session is re-validated every
  `ZAMIL_SSO_RECHECK_SECONDS` (default 60), so signing out of Zamil signs out here too.
- Not signed in to Zamil → redirect to `ZAMIL_LOGIN_URL`. AJAX calls get `401` JSON instead.
- **Sign out** (user menu) revokes the central Zamil session and returns to the Zamil login.
- Opening Zamil by LAN IP works: the sidebar link and the login redirect reuse the host you used.
