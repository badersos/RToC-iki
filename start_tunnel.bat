@echo off
echo Starting Cloudflare Tunnel...
echo Connecting to: https://rtoc-iki.onrender.com
echo.
echo Make sure:
echo 1. The tunnel is configured in Cloudflare Dashboard
echo 2. DNS records point to the tunnel
echo 3. The server is running on Render
echo.
echo To stop the tunnel, press Ctrl+C
.\cloudflared.exe tunnel --config .\tunnel_config.yml run
pause
