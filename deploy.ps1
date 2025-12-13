#!/usr/bin/env pwsh
# Deployment script for parkrun P00Qr app

Write-Host "`n=== P00Qr Deployment Script ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Select deployment option:" -ForegroundColor Yellow
Write-Host "  1) Deploy Frontend (GitHub Pages)"
Write-Host "  2) Deploy Backend (Azure Functions)"
Write-Host "  3) Deploy Both"
Write-Host ""

$choice = Read-Host "Enter your choice (1-3)"

$deployFrontend = $false
$deployBackend = $false

switch ($choice) {
    "1" { $deployFrontend = $true }
    "2" { $deployBackend = $true }
    "3" {
        $deployFrontend = $true
        $deployBackend = $true
    }
    default {
        Write-Host "Invalid choice. Exiting." -ForegroundColor Red
        exit 1
    }
}

# Function to deploy frontend
function Deploy-Frontend {
    Write-Host "`n--- Deploying Frontend ---" -ForegroundColor Cyan

    # Check if there are uncommitted changes
    $gitStatus = git status --porcelain
    if ($gitStatus) {
        Write-Host "Warning: You have uncommitted changes." -ForegroundColor Yellow
        $continue = Read-Host "Continue anyway? (y/n)"
        if ($continue -ne "y") {
            Write-Host "Deployment cancelled." -ForegroundColor Red
            return $false
        }
    }

    try {
        # Deploy to GitHub Pages using gh-pages branch
        Write-Host "Deploying to GitHub Pages..." -ForegroundColor Gray
        Write-Host "Note: Auto-detection will use production config when deployed" -ForegroundColor Gray

        # Add all files to git
        git add .
        git commit -m "Deploy to GitHub Pages" 2>&1 | Out-Null

        # Check if gh-pages branch exists
        $branchExists = git branch -r | Select-String "origin/gh-pages"

        if ($branchExists) {
            # Push to existing gh-pages branch using subtree
            git push origin `git subtree split --prefix . main`:refs/heads/gh-pages --force
        } else {
            # Create and push to new gh-pages branch
            git subtree push --prefix . origin gh-pages
        }

        if ($LASTEXITCODE -eq 0) {
            Write-Host "Frontend deployed successfully to GitHub Pages!" -ForegroundColor Green
            Write-Host "URL: https://sterobson.github.io/parkrunPositionQrCode/" -ForegroundColor Cyan
            $result = $true
        } else {
            Write-Host "Frontend deployment failed!" -ForegroundColor Red
            $result = $false
        }

        # Reset the commit
        git reset HEAD~1 2>&1 | Out-Null
    }
    catch {
        Write-Host "Error during frontend deployment: $_" -ForegroundColor Red
        $result = $false
    }

    return $result
}

# Function to deploy backend
function Deploy-Backend {
    Write-Host "`n--- Deploying Backend ---" -ForegroundColor Cyan

    # Check if Azure Functions Core Tools is installed
    $funcInstalled = Get-Command func -ErrorAction SilentlyContinue

    if ($funcInstalled) {
        Write-Host "Azure Functions Core Tools detected." -ForegroundColor Green
        Write-Host ""
        Write-Host "Backend deployment options:" -ForegroundColor Yellow
        Write-Host "  1) Deploy using func CLI (func azure functionapp publish)"
        Write-Host "  2) Open in Visual Studio (manual publish)"
        Write-Host ""

        $backendChoice = Read-Host "Enter your choice (1-2)"

        if ($backendChoice -eq "1") {
            # Deploy using func CLI
            $functionAppName = "sterobson-personal"
            Write-Host "Deploying to Azure Function App: $functionAppName..." -ForegroundColor Gray

            Push-Location "Backend\P00Qr.Backend.Functions"
            try {
                func azure functionapp publish $functionAppName --csharp

                if ($LASTEXITCODE -eq 0) {
                    Write-Host "Backend deployed successfully!" -ForegroundColor Green
                    return $true
                } else {
                    Write-Host "Backend deployment failed!" -ForegroundColor Red
                    return $false
                }
            }
            finally {
                Pop-Location
            }
        }
        elseif ($backendChoice -eq "2") {
            # Open in Visual Studio
            Write-Host "Opening solution in Visual Studio..." -ForegroundColor Gray
            Start-Process "Backend\parkrunPositionQrCode.sln"
            Write-Host "Please publish the backend manually from Visual Studio." -ForegroundColor Yellow
            Write-Host "Press Enter when deployment is complete..." -ForegroundColor Yellow
            Read-Host
            return $true
        }
        else {
            Write-Host "Invalid choice. Skipping backend deployment." -ForegroundColor Red
            return $false
        }
    }
    else {
        # func CLI not installed, open Visual Studio
        Write-Host "Azure Functions Core Tools not found." -ForegroundColor Yellow
        Write-Host "Opening solution in Visual Studio for manual publish..." -ForegroundColor Gray

        if (Test-Path "Backend\parkrunPositionQrCode.sln") {
            Start-Process "Backend\parkrunPositionQrCode.sln"
            Write-Host "Please publish the backend manually from Visual Studio." -ForegroundColor Yellow
            Write-Host "Press Enter when deployment is complete..." -ForegroundColor Yellow
            Read-Host
            return $true
        }
        else {
            Write-Host "Solution file not found at Backend\parkrunPositionQrCode.sln" -ForegroundColor Red
            return $false
        }
    }
}

# Execute deployments
$frontendSuccess = $true
$backendSuccess = $true

if ($deployFrontend) {
    $frontendSuccess = Deploy-Frontend
}

if ($deployBackend) {
    $backendSuccess = Deploy-Backend
}

# Summary
Write-Host "`n=== Deployment Summary ===" -ForegroundColor Cyan
if ($deployFrontend) {
    if ($frontendSuccess) {
        Write-Host "Frontend: SUCCESS" -ForegroundColor Green
    } else {
        Write-Host "Frontend: FAILED" -ForegroundColor Red
    }
}
if ($deployBackend) {
    if ($backendSuccess) {
        Write-Host "Backend: SUCCESS" -ForegroundColor Green
    } else {
        Write-Host "Backend: FAILED" -ForegroundColor Red
    }
}

if ($frontendSuccess -and $backendSuccess) {
    Write-Host "`nAll deployments completed successfully!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`nSome deployments failed. Please check the output above." -ForegroundColor Red
    exit 1
}
