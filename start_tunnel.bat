@echo off
echo ========================================
echo TUNNEL IS DISABLED - DO NOT USE
echo ========================================
echo.
echo The Cloudflare tunnel is causing Error 1033.
echo You don't need it - you're using GitHub Pages + Render.
echo.
echo TO FIX THE ERROR:
echo 1. Go to Cloudflare Dashboard -^> Zero Trust -^> Networks -^> Tunnels
echo 2. Find tunnel: cf1df3b3-cb3b-48c1-a660-c159a92a67ea
echo 3. Delete the route for regressorstaleofcultivation.space
echo.
echo Your DNS should point directly to GitHub Pages (A records).
echo.
pause
