# PowerShell script to commit, push, and deploy to Vercel
$env:GIT_PAGER = ""
git config core.pager ""

Write-Host "Adding vercel.json..."
git add vercel.json

Write-Host "`nCommitting changes..."
git commit -m "Revert vercel.json to commit 82e1878 version with builds and routes configuration"

Write-Host "`nPushing to remote..."
git push

Write-Host "`nChecking for Vercel CLI..."
if (Get-Command vercel -ErrorAction SilentlyContinue) {
    Write-Host "Deploying to Vercel..."
    vercel --prod
} else {
    Write-Host "Vercel CLI not found. If Vercel is connected to your git repo, deployment should happen automatically."
    Write-Host "Otherwise, install Vercel CLI: npm i -g vercel"
}


