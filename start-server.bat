@echo off
title RemYA Backend Server
color 0B

echo.
echo  ========================================
echo    RemYA Backend Server
echo  ========================================
echo.

cd /d "%~dp0server"

:: Vérifier si Node.js est installé
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERREUR] Node.js n'est pas installe ou n'est pas dans le PATH
    echo Telecharge Node.js sur https://nodejs.org/
    pause
    exit /b 1
)

:: Vérifier si les dépendances sont installées
if not exist "node_modules" (
    echo [INFO] Installation des dependances...
    echo.
    npm install
    echo.
)

:: Lancer le serveur
echo [INFO] Demarrage du serveur RemYA...
echo [INFO] URL: http://localhost:3456
echo.
echo Appuie sur Ctrl+C pour arreter le serveur
echo.

node server.js
