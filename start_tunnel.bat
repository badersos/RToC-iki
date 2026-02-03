@echo off
echo Starting Cloudflare Tunnel...
echo To stop the tunnel, press Ctrl+C
.\cloudflared.exe tunnel --config .\tunnel_config.yml run
pause
