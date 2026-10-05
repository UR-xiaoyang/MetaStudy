@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
set "ELECTRON_SKIP_BINARY_DOWNLOAD=1"
npm %*
