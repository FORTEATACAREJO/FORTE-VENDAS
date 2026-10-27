@echo off
cd /d "%~dp0"
py -3 connect_agent.py --mode vendas --watch
pause
