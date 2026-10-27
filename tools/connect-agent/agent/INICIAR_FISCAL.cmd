@echo off
cd /d "%~dp0"
py -3 connect_agent.py --mode fiscal_xml --watch
pause
