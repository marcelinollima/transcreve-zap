@echo off
rem Duplo clique para instalar o Transcreve Zap.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1" %*
pause
