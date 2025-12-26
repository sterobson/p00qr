#!/usr/bin/env pwsh
# Deployment script for parkrun P00Qr app

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("local", "production")]
    [string]$Environment,

    [Parameter(Mandatory=$false)]
    [switch]$Frontend,

    [Parameter(Mandatory=$false)]
    [switch]$Backend
)

# Color functions for better output
function Write-Info($message) { Write-Host $message -ForegroundColor Cyan }
function Write-Success($message) { Write-Host $message -ForegroundColor Green }
function Write-Warning($message) { Write-Host $message -ForegroundColor Yellow }
function Write-ErrorMessage($message) { Write-Host $message -ForegroundColor Red }
function Write-Gray($message) { Write-Host $message -ForegroundColor Gray }

# Function to kill process on a specific port
function Stop-ProcessOnPort {
    param(
        [int]$Port,
        [string]$ServiceName
    )

    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($connection) {
        Write-Warning "$ServiceName is running on port $Port. Shutting it down..."
        $processId = $connection.OwningProcess
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Write-Success "$ServiceName stopped"
        return $true
    }
    return $false
}

# Configuration
$config = @{
    local = @{
        Frontend = @{
            Port = 5173
        }
        Backend = @{
            Port = 7172
            Url = "http://localhost:7172"
        }
    }
    production = @{
        Frontend = @{
            Url = "https://sterobson.github.io/p00qr/"
        }
        Backend = @{
            AppName = "sterobson-personal"
            ProjectPath = "Backend\P00Qr.Backend.Functions"
        }
    }
}

# Banner
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  P00Qr Deployment Tool" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Ask for environment if not provided
if (-not $Environment) {
    Write-Warning "Select deployment environment:"
    Write-Host "  1. Local (Start local development servers)" -ForegroundColor White
    Write-Host "  2. Production (Deploy to GitHub Pages + Azure)" -ForegroundColor White
    Write-Host ""

    $choice = Read-Host "Enter choice (1 or 2)"

    switch ($choice) {
        "1" { $Environment = "local" }
        "2" { $Environment = "production" }
        default {
            Write-ErrorMessage "Invalid choice. Please select 1 or 2."
            exit 1
        }
    }
}

# Ask what to deploy if not specified
if (-not $Frontend -and -not $Backend) {
    Write-Host ""
    Write-Warning "What would you like to deploy?"
    Write-Host "  1. Frontend" -ForegroundColor White
    Write-Host "  2. Backend (Azure Functions)" -ForegroundColor White
    Write-Host "  3. Both" -ForegroundColor White
    Write-Host ""

    $choice = Read-Host "Enter choice (1, 2, or 3)"

    switch ($choice) {
        "1" { $Frontend = $true }
        "2" { $Backend = $true }
        "3" {
            $Frontend = $true
            $Backend = $true
        }
        default {
            Write-ErrorMessage "Invalid choice."
            exit 1
        }
    }
}

Write-Host ""
if ($Environment -eq "local") {
    Write-Info "Starting local development environment"
} else {
    Write-Info "Deploying to: $Environment"
}
if ($Frontend) { Write-Gray "  - Frontend" }
if ($Backend) { Write-Gray "  - Backend (Azure Functions)" }
Write-Host ""

$selectedConfig = $config[$Environment]
$deploymentSuccess = $true

# ============================================================================
# Local Backend - Start Azure Functions
# ============================================================================
if ($Environment -eq "local" -and $Backend) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Info "  Starting Azure Functions"
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    # Check if already running and stop it
    $wasRunning = Stop-ProcessOnPort -Port $selectedConfig.Backend.Port -ServiceName "Azure Functions"

    # Check for Azurite
    Write-Info "Checking Azurite (Azure Storage Emulator)..."
    $azuriteRunning = Get-NetTCPConnection -LocalPort 10000 -State Listen -ErrorAction SilentlyContinue

    if (-not $azuriteRunning) {
        Write-Warning "Azurite not running. Starting Azurite..."
        try {
            Start-Process -FilePath "azurite" -ArgumentList "--silent" -WindowStyle Hidden -ErrorAction Stop
            Start-Sleep -Seconds 2
            Write-Success "Azurite started"
        } catch {
            Write-Warning "Could not start Azurite. Install with: npm install -g azurite"
        }
    } else {
        Write-Success "Azurite already running"
    }

    # Build the backend
    Write-Info "Building Azure Functions..."
    $backendPath = Join-Path $PSScriptRoot $selectedConfig.production.Backend.ProjectPath
    Push-Location $backendPath
    try {
        dotnet build --nologo --verbosity quiet
        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMessage "Backend build failed"
            $deploymentSuccess = $false
        } else {
            Write-Success "Backend build completed"
        }
    } finally {
        Pop-Location
    }

    if ($deploymentSuccess) {
        Write-Info "Starting Azure Functions..."
        Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; func start --port $($selectedConfig.Backend.Port)" -WindowStyle Normal
        Start-Sleep -Seconds 5

        $funcRunning = Get-NetTCPConnection -LocalPort $selectedConfig.Backend.Port -State Listen -ErrorAction SilentlyContinue
        if ($funcRunning) {
            Write-Success "Azure Functions started on $($selectedConfig.Backend.Url)"
        } else {
            Write-Warning "Azure Functions may still be starting. Check the console window."
        }
    }
}

# ============================================================================
# Local Frontend - Start Dev Server
# ============================================================================
if ($Environment -eq "local" -and $Frontend) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Info "  Starting Frontend Dev Server"
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    # Check if already running and stop it
    $wasRunning = Stop-ProcessOnPort -Port $selectedConfig.Frontend.Port -ServiceName "Frontend dev server"

    $frontendPath = Join-Path $PSScriptRoot "Frontend"

    # Check if node_modules exists
    $nodeModules = Join-Path $frontendPath "node_modules"
    if (-not (Test-Path $nodeModules)) {
        Write-Info "Installing frontend dependencies..."
        Push-Location $frontendPath
        try {
            npm install --silent
            if ($LASTEXITCODE -ne 0) {
                Write-ErrorMessage "Failed to install dependencies"
                $deploymentSuccess = $false
            } else {
                Write-Success "Dependencies installed"
            }
        } finally {
            Pop-Location
        }
    }

    if ($deploymentSuccess) {
        Write-Info "Starting frontend dev server..."
        Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", "cd '$frontendPath'; npm run dev" -WindowStyle Normal
        Start-Sleep -Seconds 3

        $viteRunning = Get-NetTCPConnection -LocalPort $selectedConfig.Frontend.Port -State Listen -ErrorAction SilentlyContinue
        if ($viteRunning) {
            Write-Success "Frontend started on http://localhost:$($selectedConfig.Frontend.Port)"
        } else {
            Write-Warning "Frontend may still be starting. Check the console window."
        }
    }
}

# ============================================================================
# Deploy Frontend (Production)
# ============================================================================
if ($Environment -eq "production" -and $Frontend) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Info "  Deploying Frontend"
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    # Build Vue app
    Write-Info "Building Vue app..."
    Push-Location (Join-Path $PSScriptRoot "Frontend")
    npm run build 2>&1 | Out-Null
    Pop-Location

    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMessage "Frontend build failed"
        $deploymentSuccess = $false
        return
    }

    Write-Success "Frontend build completed"
    Write-Host ""

    # Update version number
    Write-Info "Updating version number..."
    $versionFile = Join-Path $PSScriptRoot "Frontend\dist\version.json"
    $now = Get-Date
    $today = $now.ToString("yyyy.MM.dd")
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
    $buildDate = $now.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

    # Update version.json
    $versionContent = @{
        version = $newVersion
        buildDate = $buildDate
        author = "Ste Robson"
    } | ConvertTo-Json

    Set-Content -Path $versionFile -Value $versionContent
    Write-Success "Version updated to: $newVersion"
    Write-Host ""

    # Check if there are uncommitted changes in frontend source files
    $gitStatus = git status --porcelain
    $frontendChanges = $gitStatus | Where-Object {
        $_ -match '^\s*M.*Frontend/src/' -or
        $_ -match '^\s*M.*Frontend/.*\.(html|js|json|vue)$' -or
        $_ -match '^\s*M.*Frontend/scripts/' -or
        $_ -match '^\s*M.*Frontend/public/'
    }

    if ($frontendChanges) {
        Write-Warning "Found uncommitted frontend source changes."
        Write-Info "Automatically committing and pushing to main branch..."

        # Add all frontend-related source changes
        git add Frontend/src/ Frontend/index-vue.html Frontend/vite.config.js Frontend/package.json Frontend/scripts/ Frontend/public/ 2>&1 | Out-Null

        # Commit with timestamp
        $commitMessage = "Deploy frontend changes - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        git commit -m $commitMessage 2>&1 | Out-Null

        if ($LASTEXITCODE -eq 0) {
            Write-Gray "Pushing to origin/main..."
            git push origin main 2>&1 | Out-Null

            if ($LASTEXITCODE -eq 0) {
                Write-Success "Changes committed and pushed to main branch"
            } else {
                Write-ErrorMessage "Failed to push to origin/main"
                $deploymentSuccess = $false
            }
        } else {
            Write-Warning "No changes to commit (possibly already committed)"
        }
    } else {
        Write-Success "No uncommitted frontend source changes"
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
                    Write-Gray "Copying built files to deployment directory..."

                    # Get list of files to deploy from the Frontend/dist directory (built by Vite)
                    $sourceRoot = $PSScriptRoot
                    $distPath = Join-Path $sourceRoot "Frontend\dist"

                    if (Test-Path $distPath) {
                        # Copy all files from dist directory to worktree root
                        Get-ChildItem -Path $distPath -Recurse | ForEach-Object {
                            $targetPath = $_.FullName.Replace($distPath, $worktreePath)
                            if ($_.PSIsContainer) {
                                if (-not (Test-Path $targetPath)) {
                                    New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
                                }
                            } else {
                                Copy-Item -Path $_.FullName -Destination $targetPath -Force
                            }
                        }
                    } else {
                        Write-ErrorMessage "Dist directory not found at: $distPath"
                        $deploymentSuccess = $false
                        return
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
                            Write-Gray "URL: $($selectedConfig.Frontend.Url)"
                        } else {
                            Write-ErrorMessage "Failed to push to GitHub"
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
            Write-ErrorMessage "Error during frontend deployment: $_"
            $deploymentSuccess = $false
        }
    }
}

# ============================================================================
# Deploy Backend (Azure Functions) - Production
# ============================================================================
if ($Environment -eq "production" -and $Backend) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Info "  Deploying Backend (Azure Functions)"
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    $backendPath = Join-Path $PSScriptRoot $selectedConfig.Backend.ProjectPath

    if (-not (Test-Path $backendPath)) {
        Write-ErrorMessage "Backend directory not found at: $backendPath"
        $deploymentSuccess = $false
    } else {
        # Check if func tool is installed
        Write-Info "Checking Azure Functions Core Tools..."

        $funcVersion = func --version 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMessage "Azure Functions Core Tools not found!"
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
                    Write-ErrorMessage "Not authenticated with Azure!"
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
                        Write-ErrorMessage "Backend build failed"
                        $deploymentSuccess = $false
                    } else {
                        Write-Success "Backend build completed"

                        # Deploy
                        Write-Host ""
                        Write-Info "Deploying to Azure..."
                        Write-Gray "Function App: $($selectedConfig.Backend.AppName)"
                        Write-Gray "This may take a few minutes..."
                        Write-Host ""

                        $ErrorActionPreference = "Continue"
                        func azure functionapp publish $selectedConfig.Backend.AppName --dotnet-isolated 2>&1 | ForEach-Object {
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
                            Write-Gray "Function App: $($selectedConfig.Backend.AppName)"
                        } else {
                            Write-ErrorMessage "Backend deployment failed"
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
    Write-ErrorMessage "  Deployment Failed!"
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($deploymentSuccess) {
    if ($Environment -eq "local") {
        Write-Host "Local development servers:" -ForegroundColor White
        if ($Backend) {
            Write-Host "  [OK] Backend  -> $($selectedConfig.Backend.Url)" -ForegroundColor Green
        }
        if ($Frontend) {
            Write-Host "  [OK] Frontend -> http://localhost:$($selectedConfig.Frontend.Port)" -ForegroundColor Green
        }
    } else {
        Write-Host "Deployed to: $Environment" -ForegroundColor White
        if ($Frontend) {
            Write-Host "  [OK] Frontend -> GitHub Pages" -ForegroundColor Green
            Write-Gray "       $($selectedConfig.Frontend.Url)"
        }
        if ($Backend) {
            Write-Host "  [OK] Backend -> Azure Functions" -ForegroundColor Green
            Write-Gray "       App: $($selectedConfig.Backend.AppName)"
        }
    }
    Write-Host ""
    exit 0
} else {
    Write-Host "Some deployments failed. Please check the errors above." -ForegroundColor Red
    Write-Host ""
    exit 1
}
