@echo off
cd /d C:\Users\Dell\caregiver-briefing-tool

REM Run TypeScript type-check
call npx tsc --noEmit 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo {"allow_tool": false, "deny_reason": "TypeScript compilation failed. Run 'npx tsc --noEmit' to see errors and fix them before proceeding."}
    exit /b 0
)

REM Run linter (if configured)
call npm run lint -- --quiet 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo {"allow_tool": false, "deny_reason": "Linting failed. Run 'npm run lint' to see errors and fix them before proceeding."}
    exit /b 0
)

echo {"allow_tool": true}
exit /b 0
