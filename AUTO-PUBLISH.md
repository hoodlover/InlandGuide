# InlandGuide master watcher

The production watcher reads the locally synced SharePoint workbook first:

`C:\Users\COBBLA\OneDrive - Hapag-Lloyd AG\Region North America - Inland\InlandCutoffGuide.xlsm`

The mapped `Z:` workbook is fallback-only. A workbook must be stable, readable,
contain `DATABASE`, `HOLIDAYS`, `PORTMC`, and `PORTSERVICES`, and produce between
100 and 1,000 valid lanes before any generated data file is replaced.

## One-time installation on COBBLA's signed-in Windows session

Open PowerShell in `C:\Users\COBBLA\InlandGuide` and run:

```powershell
git pull origin main
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-master-watch.ps1
```

This installs one current-user Task Scheduler task named
`InlandGuide Master Watch`. It checks every 10 minutes from 8:00 AM through
5:00 PM and runs once at sign-in for missed-start recovery. It disables an old
competing task only when that task explicitly calls `publish-master-hourly.ps1`
or `AutoPublish.bat`.

Every invocation is recorded in `auto-publish.log`. Unchanged valid data is
logged but does not create a commit or Vercel deployment. The Managers Hub
manual publish remains independent and works when COBBLA's computer is offline.
Scheduled checks run with a hidden PowerShell window. A five-second Windows
message appears only after changed master data is successfully pushed.

## Verify or remove the task

```powershell
Get-ScheduledTask -TaskName "InlandGuide Master Watch"
Get-ScheduledTaskInfo -TaskName "InlandGuide Master Watch" |
    Select-Object LastRunTime, LastTaskResult, NextRunTime

Unregister-ScheduledTask -TaskName "InlandGuide Master Watch" -Confirm
```
