# EBS connectivity: what changes when Zamil goes live on the internet

**Status:** decision needed · **Date:** 2026-11-21 · **Applies to:** the Attendance app (`attendance/`) and
the legacy CI3 app (`zamil-attendance/`)

## The problem in one paragraph

Some attendance pages read from Oracle E-Business Suite (EBS): Daily Attendance, Manager View and the three
Contractor pages. EBS runs inside the Zamil office network. Today this works because the app also runs
inside that network, or because the user is on the VPN. Once Zamil Digitalization is hosted on the internet,
the server cannot reach EBS. Opening EBS to the internet is not an option: it is the production ERP. We need a
lasting way to get this data to the app, or to stop depending on EBS for it.

## What the attendance app takes from EBS

| Data                                    | EBS objects                                                                 | Used by                                            | Access             |
| --------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------- | ------------------ |
| Raw biometric punches                   | `ZPI.ICLOCK_TRANSACTION`                                                    | Daily Attendance, Manager View, Contractor Summary | read               |
| Device employee list                    | `ZPI.PERSONNEL_EMPLOYEE`                                                    | Daily Attendance, Manager View                     | read               |
| Device daily calculation (late, worked) | `ZPI.ATT_PAYLOADBASE`                                                       | Daily Attendance, Manager View                     | read               |
| Device timetable                        | `ZPI.XX_TIMETABLE`                                                          | Daily Attendance (scheduled count)                 | read               |
| Contractor companies and workers        | `XXZP.XX_CONTRACTOR_INFO`, `XXZP.XX_CON_EMPLOYEE_INFO`                      | Contractors, Contractor Employees, Summary         | **read and write** |
| HR lookups                              | `HR_ORGANIZATION_UNITS`, `PER_JOBS_TL`, `PER_PEOPLE_X`, `PER_ASSIGNMENTS_X` | Contractor pages                                   | read               |

The `ZPI.*` tables are written by the biometric device software (ZKTeco BioTime / iClock). EBS is simply
where that software keeps its database. Every other attendance page already runs on the cloud database
(Oracle ADW), so this question covers 5 of the 19 menu items.

## Where things stand now

- **Same setup as CI3:** the new app connects to EBS exactly as CI3 does, using the same keys and values from `zamil-attendance/.env` and the same connection descriptor.
- **With the VPN or in the office:** the EBS pages work.
- **Without it:** they show _"The E-Business Suite database cannot be reached. Connect to the Zamil VPN (or office network) and try again."_ within about 10 seconds. The rest of the app keeps working.
- **The switch:** the code reads EBS through one setting, `EBS_SOURCE`. Today it is `ebs` (the direct connection). Once a copy of the data exists in ADW, setting it to `adw` moves every EBS page to the cloud copy without code changes (see Option B).

## Options

### A. Private network link between the hosting and the office

A site-to-site IPsec VPN (or OCI FastConnect) from the cloud network that hosts the app to the Zamil firewall.
The app keeps connecting to EBS as it does today.

|      |                                                                                                                                                                                                                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pros | No application change. Live data.                                                                                                                                                                                                                                                  |
| Cons | The app server must sit in a private cloud network with the tunnel (not a simple public host). The internet app depends on the office line and EBS being up. Production EBS gets query load from the internet app. The firewall must allow one cloud IP to reach the EBS listener. |
| Who  | Network team (tunnel, firewall), DBA (a least-privilege EBS account instead of `APPS`).                                                                                                                                                                                            |

### B. Copy the needed EBS data into ADW (recommended for go-live)

A small scheduled job inside the office network pushes the data **outwards** to ADW. The internet app then reads
only ADW.

| Data                                             | How often                                | Method                                                                                                                           |
| ------------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Punches (`ICLOCK_TRANSACTION`)                   | every 5 minutes, new rows only           | incremental by transaction ID / punch time                                                                                       |
| `PERSONNEL_EMPLOYEE`, `XX_TIMETABLE`, HR lookups | nightly (or hourly)                      | full refresh (small tables)                                                                                                      |
| `ATT_PAYLOADBASE`                                | every 15 minutes, current payroll period | merge on employee + date                                                                                                         |
| Contractor tables                                | one-time move                            | ADW becomes the system of record; the app writes there. If any EBS process still needs these tables, a nightly copy back to EBS. |

The job can be:

- a scheduled Node script on any office server, using the same Oracle driver as the app;
- an Oracle `DBMS_SCHEDULER` job with a database link from EBS to ADW;
- Oracle GoldenGate, if Zamil already licenses it.

|      |                                                                                                                                                                                                                                   |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pros | Nothing in the office is opened to the internet: only outbound TLS to ADW, which Zamil already uses. The app is fully cloud-hosted. The pages keep working (with the last copy) if the office line drops. EBS load is negligible. |
| Cons | Data is a few minutes old (configurable). There is one small job to run and monitor. Needs mirror tables in ADW (DDL, with approval).                                                                                             |
| Who  | Development (job + mirror tables, about 3–5 days), DBA (read-only EBS account, ADW tables), an office server to run the job.                                                                                                      |

### C. Take EBS out of attendance altogether (target state)

Send the biometric data straight to the cloud instead of through the office database:

- **Devices:** ZKTeco devices support "push" (ADMS) to a server address. Either point them at a BioTime server hosted in the cloud, or add a small receiving endpoint to the Attendance API that writes punches into ADW.
- **Contractors:** contractor data moves to ADW for good (as in B).
- **HR lookups:** these come from the employee data Zamil already syncs into ADW (`XX_DIGI_EMP_MASTER`), extended with departments and jobs.

|      |                                                                                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Pros | No EBS dependency at all. Live punches. One source of truth. The manual file upload becomes a fallback only.                                   |
| Cons | Needs device and BioTime configuration (each device needs outbound internet), coordination with the device vendor, and a migration of history. |
| Who  | IT / device vendor, development (receiver endpoint), HR (cut-over date).                                                                       |

### D. A small read-only API published from the office

A service in the office DMZ (for example Oracle REST Data Services on the EBS database) answers a few
read-only queries over mTLS, published through an API gateway or tunnel.

|      |                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Pros | Live data without exposing the database.                                                                                                   |
| Cons | A new internet-facing service to secure and run. The app still depends on the office being online. Contractor writes need extra endpoints. |

## Comparison

|                                  | A. Private link | B. Copy to ADW        | C. No EBS               | D. Office API  |
| -------------------------------- | --------------- | --------------------- | ----------------------- | -------------- |
| Opens the office to the internet | tunnel only     | **no**                | **no**                  | yes (one API)  |
| Works if the office line is down | no              | yes (last copy)       | yes                     | no             |
| Data freshness                   | live            | ~5 min                | live                    | live           |
| Application change               | none            | config switch (built) | endpoint + migration    | new data layer |
| Effort                           | network work    | ~1 week               | weeks, vendor-dependent | ~1–2 weeks     |
| Load on production EBS           | yes             | minimal               | none                    | yes            |

## Recommendation

1. **Now, until go-live:** keep the direct connection (already done). It works on the VPN, as CI3 did.
2. **For go-live:** Option B. Build the copy job and mirror tables, move contractor data to ADW, then switch `EBS_SOURCE=adw`.
3. **Next:** Option C. Move the biometric devices to push to the cloud and retire the EBS dependency for attendance.

Option A is a reasonable short-term fallback only if go-live comes before B is ready.

## Decisions needed

1. Which option for go-live (recommended: B).
2. An office server (or the EBS database scheduler) to run the copy job, and who monitors it.
3. Acceptable delay for "today" figures (recommended: 5 minutes).
4. Whether any EBS process uses `XX_CONTRACTOR_INFO` / `XX_CON_EMPLOYEE_INFO`. If not, ADW becomes their only home.
5. A least-privilege EBS account for the job. CI3 uses `APPS`, which is far more than needed.
6. For Option C: the device model, BioTime version and vendor contact.

## Security notes

- EBS credentials live only in git-ignored `.env` files and are never committed.
- Whatever the option, replace the `APPS` account with a read-only account limited to the objects above (plus write on the two contractor tables while they still live in EBS).
- Never expose the EBS listener (port 1521) to the internet.
