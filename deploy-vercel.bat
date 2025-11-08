@echo off
set GIT_PAGER=
git config core.pager ""
git add vercel.json
git commit -m "Revert vercel.json to commit 82e1878 version with builds and routes configuration"
git push
echo.
echo Checking for Vercel CLI...
where vercel >nul 2>&1
if %errorlevel% == 0 (
    echo Deploying to Vercel...
    vercel --prod
) else (
    echo Vercel CLI not found. If Vercel is connected to your git repo, deployment should happen automatically.
    echo Otherwise, install Vercel CLI: npm i -g vercel
)


