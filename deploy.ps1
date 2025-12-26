#!/usr/bin/env pwsh
# Deployment script for parkrun P00Qr app

# Color functions for better output
function Write-Info($message) { Write-Host $message -ForegroundColor Cyan }
function Write-Success($message) { Write-Host $message -ForegroundColor Green }
function Write-Warning($message) { Write-Host $message -ForegroundColor Yellow }
function Write-Error($message) { Write-Host $message -ForegroundColor Red }
function Write-Gray($message) { Write-Host $message -ForegroundColor Gray }

# Configuration
$config = @{
    Frontend = @{
        Url = "https://sterobson.github.io/p00qr/"
    }
    Backend = @{
        AppName = "sterobson-personal"
        ProjectPath = "Backend\P00Qr.Backend.Functions"
    }
}

# Banner
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  P00Qr Deployment Tool" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Ask what to deploy
Write-Warning "Select deployment option:"
Write-Host "  1) Deploy Frontend (GitHub Pages)" -ForegroundColor White
Write-Host "  2) Deploy Backend (Azure Functions)" -ForegroundColor White
Write-Host "  3) Deploy Both" -ForegroundColor White
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
        Write-Error "Invalid choice. Exiting."
        exit 1
    }
}

Write-Host ""
Write-Info "Deploying:"
if ($deployFrontend) { Write-Gray "  - Frontend (GitHub Pages)" }
if ($deployBackend) { Write-Gray "  - Backend (Azure Functions)" }
Write-Host ""

$deploymentSuccess = $true

# ============================================================================
# Deploy Frontend
# ============================================================================
if ($deployFrontend) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Info "  Deploying Frontend"
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    # Update version number
    Write-Info "Updating version number..."
    $versionFile = Join-Path $PSScriptRoot "version.json"
    $today = Get-Date -Format "yyyy.MM.dd"
    $currentVersion = "2025.12.26-01"
    $deploymentNumber = 1

    if (Test-Path $versionFile) {
        $versionData = Get-Content $versionFile | ConvertFrom-Json
        $currentVersion = $versionData.version

        # Extract date and number from current version
        if ($currentVersion -match '^(\d{4}\.\d{2}\.\d{2})-(\d{2})$') {
            $versionDate = $matches[1]
            $versionNumber = [int]$matches[2]

            if ($versionDate -eq $today) {
                # Same day - increment number
                $deploymentNumber = $versionNumber + 1
            } else {
                # New day - reset to 01
                $deploymentNumber = 1
            }
        }
    }

    # Create new version string
    $newVersion = "$today-$($deploymentNumber.ToString('00'))"
    $buildDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

    # Update version.json
    $versionContent = @{
        version = $newVersion
        buildDate = $buildDate
        author = "Ste Robson"
    } | ConvertTo-Json

    Set-Content -Path $versionFile -Value $versionContent
    Write-Success "Version updated to: $newVersion"
    Write-Host ""

    # Check if there are uncommitted changes in frontend files
    $gitStatus = git status --porcelain
    $frontendChanges = $gitStatus | Where-Object {
        $_ -match '^\s*M.*\.(html|css|js|svg|json)$' -or
        $_ -match '^\s*M.*scripts/' -or
        $_ -match '^\s*M.*public/'
    }

    if ($frontendChanges) {
        Write-Warning "Found uncommitted frontend changes."
        Write-Info "Automatically committing and pushing to main branch..."

        # Add all frontend-related changes including version.json
        git add index.html styles.css favicon.svg scripts/ public/ version.json 2>&1 | Out-Null

        # Commit with timestamp
        $commitMessage = "Deploy frontend changes - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        git commit -m $commitMessage 2>&1 | Out-Null

        if ($LASTEXITCODE -eq 0) {
            Write-Gray "Pushing to origin/main..."
            git push origin main 2>&1 | Out-Null

            if ($LASTEXITCODE -eq 0) {
                Write-Success "Changes committed and pushed to main branch"
            } else {
                Write-Error "Failed to push to origin/main"
                $deploymentSuccess = $false
            }
        } else {
            Write-Warning "No changes to commit (possibly already committed)"
        }
    } else {
        Write-Success "No uncommitted frontend changes"
    }

    if ($deploymentSuccess) {
        try {
            Write-Info "Deploying to GitHub Pages..."
            Write-Gray "Note: Auto-detection will use production config when deployed"
            Write-Host ""

            # Use git worktree to deploy to gh-pages branch (SAFE - doesn't touch main working tree)
            Write-Gray "Setting up deployment worktree..."

            # Create temp directory for gh-pages worktree
            $worktreePath = Join-Path $env:TEMP "gh-pages-deploy-$(Get-Date -Format 'yyyyMMddHHmmss')"

            try {
                # Fetch latest gh-pages
                git fetch origin gh-pages:gh-pages 2>&1 | Out-Null

                # Create worktree for gh-pages branch
                git worktree add $worktreePath gh-pages 2>&1 | Out-Null

                if ($LASTEXITCODE -ne 0) {
                    # gh-pages branch doesn't exist, create orphan branch
                    Write-Warning "gh-pages branch doesn't exist, creating it..."
                    git worktree add --detach $worktreePath 2>&1 | Out-Null
                    Push-Location $worktreePath
                    git checkout --orphan gh-pages 2>&1 | Out-Null
                    git rm -rf . 2>&1 | Out-Null
                    Pop-Location
                }

                Push-Location $worktreePath

                try {
                    # Clean the worktree (remove old files)
                    Write-Gray "Cleaning deployment directory..."
                    Get-ChildItem -Path $worktreePath -Exclude ".git" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

                    # Copy files from main branch to worktree
                    Write-Gray "Copying files to deployment directory..."

                    # Get list of files to deploy from main branch (exclude Backend, .git, etc.)
                    $sourceRoot = $PSScriptRoot

                    # Copy specific frontend files and directories
                    $itemsToCopy = @(
                        "index.html",
                        "styles.css",
                        "favicon.svg",
                        "version.json",
                        "scripts",
                        "public"
                    )

                    foreach ($item in $itemsToCopy) {
                        $sourcePath = Join-Path $sourceRoot $item
                        if (Test-Path $sourcePath) {
                            Copy-Item -Path $sourcePath -Destination $worktreePath -Recurse -Force
                        } else {
                            Write-Gray "  Skipping $item (not found)"
                        }
                    }

                    # Add .nojekyll file
                    $nojekyll = Join-Path $worktreePath ".nojekyll"
                    if (-not (Test-Path $nojekyll)) {
                        New-Item -ItemType File -Path $nojekyll -Force | Out-Null
                    }

                    # Commit and push
                    git add -A 2>&1 | Out-Null

                    $commitMessage = "Deploy frontend - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
                    git commit -m $commitMessage 2>&1 | Out-Null

                    if ($LASTEXITCODE -eq 0) {
                        Write-Gray "Pushing to GitHub..."
                        git push origin gh-pages 2>&1 | Out-Null

                        if ($LASTEXITCODE -eq 0) {
                            Write-Success "Frontend deployed to GitHub Pages!"
                            Write-Gray "URL: $($config.Frontend.Url)"
                        } else {
                            Write-Error "Failed to push to GitHub"
                            $deploymentSuccess = $false
                        }
                    } else {
                        Write-Warning "No changes to commit"
                    }
                } finally {
                    Pop-Location
                }
            } finally {
                # Remove the worktree
                if (Test-Path $worktreePath) {
                    git worktree remove $worktreePath --force 2>&1 | Out-Null
                }
            }
        }
        catch {
            Write-Error "Error during frontend deployment: $_"
            $deploymentSuccess = $false
        }
    }
}

# ============================================================================
# Deploy Backend (Azure Functions)
# ============================================================================
if ($deployBackend) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Info "  Deploying Backend (Azure Functions)"
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    $backendPath = Join-Path $PSScriptRoot $config.Backend.ProjectPath

    if (-not (Test-Path $backendPath)) {
        Write-Error "Backend directory not found at: $backendPath"
        $deploymentSuccess = $false
    } else {
        # Check if func tool is installed
        Write-Info "Checking Azure Functions Core Tools..."

        $funcVersion = func --version 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Azure Functions Core Tools not found!"
            Write-Host ""
            Write-Warning "Install Azure Functions Core Tools:"
            Write-Gray "  npm install -g azure-functions-core-tools@4"
            Write-Gray "  or: winget install Microsoft.Azure.FunctionsCoreTools"
            Write-Host ""
            $deploymentSuccess = $false
        } else {
            Write-Success "Azure Functions Core Tools found (version: $funcVersion)"

            # Check Azure authentication
            Write-Info "Checking Azure authentication..."

            $azCommand = Get-Command az -ErrorAction SilentlyContinue
            if (-not $azCommand) {
                Write-Warning "Azure CLI (az) not found - skipping authentication check"
                Write-Gray "  Install from: https://aka.ms/installazurecliwindows"
                Write-Success "Continuing with deployment (authentication will be checked during func azure functionapp publish)"
            } else {
                $azResult = az account show 2>&1
                if ($LASTEXITCODE -ne 0) {
                    Write-Error "Not authenticated with Azure!"
                    Write-Host ""
                    Write-Warning "Please login to Azure:"
                    Write-Gray "  az login"
                    Write-Host ""
                    $deploymentSuccess = $false
                } else {
                    Write-Success "Authenticated with Azure"
                }
            }

            if ($deploymentSuccess) {
                Push-Location $backendPath

                try {
                    # Build
                    Write-Host ""
                    Write-Info "Building backend..."
                    dotnet build -c Release --nologo

                    if ($LASTEXITCODE -ne 0) {
                        Write-Error "Backend build failed"
                        $deploymentSuccess = $false
                    } else {
                        Write-Success "Backend build completed"

                        # Deploy
                        Write-Host ""
                        Write-Info "Deploying to Azure..."
                        Write-Gray "Function App: $($config.Backend.AppName)"
                        Write-Gray "This may take a few minutes..."
                        Write-Host ""

                        $ErrorActionPreference = "Continue"
                        func azure functionapp publish $config.Backend.AppName --dotnet-isolated 2>&1 | ForEach-Object {
                            if ($_ -is [System.Management.Automation.ErrorRecord]) {
                                if ($_.Exception.Message -and $_.Exception.Message.Trim()) {
                                    Write-Host $_.Exception.Message
                                }
                            } else {
                                Write-Host $_
                            }
                        }
                        $ErrorActionPreference = "Stop"

                        if ($LASTEXITCODE -eq 0) {
                            Write-Host ""
                            Write-Success "Backend deployed to Azure!"
                            Write-Gray "Function App: $($config.Backend.AppName)"
                        } else {
                            Write-Error "Backend deployment failed"
                            $deploymentSuccess = $false
                        }
                    }
                } finally {
                    Pop-Location
                }
            }
        }
    }
}

# ============================================================================
# Summary
# ============================================================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($deploymentSuccess) {
    Write-Success "  Deployment Complete!"
} else {
    Write-Error "  Deployment Failed!"
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($deploymentSuccess) {
    if ($deployFrontend) {
        Write-Host "  [OK] Frontend -> GitHub Pages" -ForegroundColor Green
        Write-Gray "       $($config.Frontend.Url)"
    }
    if ($deployBackend) {
        Write-Host "  [OK] Backend -> Azure Functions" -ForegroundColor Green
        Write-Gray "       App: $($config.Backend.AppName)"
    }
    Write-Host ""
    exit 0
} else {
    Write-Host "Some deployments failed. Please check the errors above." -ForegroundColor Red
    Write-Host ""
    exit 1
}
