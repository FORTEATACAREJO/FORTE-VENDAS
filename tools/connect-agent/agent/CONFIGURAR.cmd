@echo off
cd /d "%~dp0"
py -3 connect_agent.py --setup
if errorlevel 1 pause
