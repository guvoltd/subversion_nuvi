<#
.SYNOPSIS
    Subversion Nuvi - PowerShell Administration Module (SvnAdmin)
.DESCRIPTION
    Provides complete parity with VisualSVN Server PowerShell cmdlets, enabling automated DevOps pipelines,
    repository provisioning, access control auditing, hot backups, and disaster recovery.
#>

$script:NuviApiBase = if ($env:NUVI_API_URL) { $env:NUVI_API_URL } else { "http://localhost:8080/api/v1" }

function Set-SvnServerEndpoint {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$Url
    )
    $script:NuviApiBase = $Url.TrimEnd('/')
    Write-Verbose "Set Nuvi API endpoint to $script:NuviApiBase"
}

# --- Server Cmdlets ---

function Get-SvnServerStatus {
    [CmdletBinding()]
    param()
    Invoke-RestMethod -Uri "$script:NuviApiBase/server/status" -Method Get
}

# --- Repository Cmdlets ---

function Get-SvnRepository {
    [CmdletBinding()]
    param(
        [Parameter(Position=0)]
        [string]$Name
    )
    $repos = Invoke-RestMethod -Uri "$script:NuviApiBase/repositories" -Method Get
    if ($Name) {
        return $repos | Where-Object { $_.name -eq $Name }
    }
    return $repos
}

function New-SvnRepository {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true, Position=0)]
        [string]$Name,
        [Parameter()]
        [string]$Description,
        [Parameter()]
        [switch]$CreateStandardLayout
    )
    $body = @{
        name = $Name
        description = $Description
        init_standard_layout = $CreateStandardLayout.IsPresent
    } | ConvertTo-Json

    Invoke-RestMethod -Uri "$script:NuviApiBase/repositories" -Method Post -Body $body -ContentType "application/json"
}

function Remove-SvnRepository {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true, Position=0)]
        [string]$Name,
        [Parameter()]
        [switch]$DeleteFiles
    )
    $repo = Get-SvnRepository -Name $Name
    if (-not $repo) {
        throw "Repository '$Name' not found."
    }
    $delFiles = if ($DeleteFiles.IsPresent) { "true" } else { "false" }
    Invoke-RestMethod -Uri "$script:NuviApiBase/repositories/$($repo.id)?delete_files=$delFiles" -Method Delete
}

function Test-SvnRepository {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true, Position=0)]
        [string]$Name
    )
    $repo = Get-SvnRepository -Name $Name
    if (-not $repo) {
        throw "Repository '$Name' not found."
    }
    Invoke-RestMethod -Uri "$script:NuviApiBase/repositories/$($repo.id)/verify" -Method Post
}

# --- User & Group Cmdlets ---

function Get-SvnUser {
    [CmdletBinding()]
    param(
        [Parameter(Position=0)]
        [string]$Username
    )
    $users = Invoke-RestMethod -Uri "$script:NuviApiBase/users" -Method Get
    if ($Username) {
        return $users | Where-Object { $_.username -eq $Username }
    }
    return $users
}

function New-SvnUser {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true, Position=0)]
        [string]$Username,
        [Parameter(Mandatory=$true)]
        [string]$Password,
        [Parameter()]
        [string]$Email,
        [Parameter()]
        [string]$FullName,
        [Parameter()]
        [switch]$IsAdmin
    )
    $body = @{
        username = $Username
        password = $Password
        email = $Email
        full_name = $FullName
        is_admin = $IsAdmin.IsPresent
    } | ConvertTo-Json

    Invoke-RestMethod -Uri "$script:NuviApiBase/users" -Method Post -Body $body -ContentType "application/json"
}

function Set-SvnUserPassword {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true, Position=0)]
        [string]$Username,
        [Parameter(Mandatory=$true)]
        [string]$NewPassword
    )
    $user = Get-SvnUser -Username $Username
    if (-not $user) { throw "User '$Username' not found." }

    $body = @{ new_password = $NewPassword } | ConvertTo-Json
    Invoke-RestMethod -Uri "$script:NuviApiBase/users/$($user.id)/password" -Method Post -Body $body -ContentType "application/json"
}

function Remove-SvnUser {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true, Position=0)]
        [string]$Username
    )
    $user = Get-SvnUser -Username $Username
    if (-not $user) { throw "User '$Username' not found." }
    Invoke-RestMethod -Uri "$script:NuviApiBase/users/$($user.id)" -Method Delete
}

function Get-SvnGroup {
    [CmdletBinding()]
    param(
        [Parameter(Position=0)]
        [string]$Name
    )
    $groups = Invoke-RestMethod -Uri "$script:NuviApiBase/groups" -Method Get
    if ($Name) {
        return $groups | Where-Object { $_.name -eq $Name }
    }
    return $groups
}

function New-SvnGroup {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true, Position=0)]
        [string]$Name,
        [Parameter()]
        [string]$Description
    )
    $body = @{ name = $Name; description = $Description } | ConvertTo-Json
    Invoke-RestMethod -Uri "$script:NuviApiBase/groups" -Method Post -Body $body -ContentType "application/json"
}

function Add-SvnGroupMember {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true, Position=0)]
        [string]$GroupName,
        [Parameter(Mandatory=$true, Position=1)]
        [string]$Username
    )
    $group = Get-SvnGroup -Name $GroupName
    if (-not $group) { throw "Group '$GroupName' not found." }
    $body = @{ username = $Username } | ConvertTo-Json
    Invoke-RestMethod -Uri "$script:NuviApiBase/groups/$($group.id)/members" -Method Post -Body $body -ContentType "application/json"
}

function Remove-SvnGroupMember {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true, Position=0)]
        [string]$GroupName,
        [Parameter(Mandatory=$true, Position=1)]
        [string]$Username
    )
    $group = Get-SvnGroup -Name $GroupName
    if (-not $group) { throw "Group '$GroupName' not found." }
    Invoke-RestMethod -Uri "$script:NuviApiBase/groups/$($group.id)/members/$Username" -Method Delete
}

# --- Access Control & Effective Permissions Cmdlets ---

function Get-SvnAccessRule {
    [CmdletBinding()]
    param(
        [Parameter()]
        [string]$RepositoryName
    )
    $uri = "$script:NuviApiBase/acl/rules"
    if ($RepositoryName) {
        $repo = Get-SvnRepository -Name $RepositoryName
        if ($repo) { $uri += "?repository_id=$($repo.id)" }
    }
    Invoke-RestMethod -Uri $uri -Method Get
}

function Add-SvnAccessRule {
    [CmdletBinding()]
    param(
        [Parameter()]
        [string]$RepositoryName,
        [Parameter(Mandatory=$true)]
        [string]$Path,
        [Parameter(Mandatory=$true)]
        [ValidateSet('user', 'group', 'everyone')]
        [string]$PrincipalType,
        [Parameter(Mandatory=$true)]
        [string]$PrincipalName,
        [Parameter(Mandatory=$true)]
        [ValidateSet('rw', 'r', '')]
        [string]$Permission
    )
    $repoId = $null
    if ($RepositoryName) {
        $repo = Get-SvnRepository -Name $RepositoryName
        if (-not $repo) { throw "Repository '$RepositoryName' not found." }
        $repoId = $repo.id
    }
    $body = @{
        repository_id = $repoId
        path = $Path
        principal_type = $PrincipalType
        principal_name = $PrincipalName
        permission = $Permission
    } | ConvertTo-Json

    Invoke-RestMethod -Uri "$script:NuviApiBase/acl/rules" -Method Post -Body $body -ContentType "application/json"
}

function Test-SvnEffectiveAccess {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$RepositoryName,
        [Parameter(Mandatory=$true)]
        [string]$Username,
        [Parameter()]
        [string]$Path = "/"
    )
    $repo = Get-SvnRepository -Name $RepositoryName
    if (-not $repo) { throw "Repository '$RepositoryName' not found." }

    $body = @{
        repository_id = $repo.id
        username = $Username
        path = $Path
    } | ConvertTo-Json

    Invoke-RestMethod -Uri "$script:NuviApiBase/acl/effective" -Method Post -Body $body -ContentType "application/json"
}

# --- Hot Backups, Sandbox Verification & Recovery Cmdlets ---

function Backup-SvnRepository {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true, Position=0)]
        [string]$Name,
        [Parameter()]
        [ValidateSet('full', 'incremental')]
        [string]$BackupType = 'full',
        [Parameter()]
        [switch]$Force,
        [Parameter()]
        [string]$Passphrase
    )
    $repo = Get-SvnRepository -Name $Name
    if (-not $repo) { throw "Repository '$Name' not found." }

    $body = @{
        backup_type = $BackupType
        force = $Force.IsPresent
        passphrase = $Passphrase
    } | ConvertTo-Json

    Invoke-RestMethod -Uri "$script:NuviApiBase/operations/backup/run/$($repo.id)" -Method Post -Body $body -ContentType "application/json"
}

function Test-SvnRepositoryBackup {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true, Position=0)]
        [int]$ArchiveId,
        [Parameter()]
        [string]$Passphrase
    )
    $uri = "$script:NuviApiBase/operations/backup/verify/$ArchiveId"
    if ($Passphrase) {
        $uri += "?passphrase=$([System.Web.HttpUtility]::UrlEncode($Passphrase))"
    }
    Invoke-RestMethod -Uri $uri -Method Post
}

function Restore-SvnRepository {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true, Position=0)]
        [int]$ArchiveId,
        [Parameter(Mandatory=$true)]
        [string]$TargetRepositoryName,
        [Parameter()]
        [string]$Passphrase
    )
    $body = @{
        target_repository_name = $TargetRepositoryName
        encryption_passphrase = $Passphrase
    } | ConvertTo-Json

    Invoke-RestMethod -Uri "$script:NuviApiBase/operations/backup/restore/$ArchiveId" -Method Post -Body $body -ContentType "application/json"
}

# --- Hook Engine Cmdlets ---

function Get-SvnHookConfig {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true, Position=0)]
        [string]$RepositoryName,
        [Parameter(Mandatory=$true, Position=1)]
        [ValidateSet('pre-commit', 'post-commit')]
        [string]$HookName
    )
    $repo = Get-SvnRepository -Name $RepositoryName
    if (-not $repo) { throw "Repository '$RepositoryName' not found." }
    Invoke-RestMethod -Uri "$script:NuviApiBase/operations/hooks/$($repo.id)/$HookName" -Method Get
}

function Set-SvnHookConfig {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true, Position=0)]
        [string]$RepositoryName,
        [Parameter(Mandatory=$true, Position=1)]
        [ValidateSet('pre-commit', 'post-commit')]
        [string]$HookName,
        [Parameter()]
        [bool]$IsEnabled = $true,
        [Parameter()]
        [bool]$CheckCommitMessage = $false,
        [Parameter()]
        [string]$CommitMessagePattern = '^.{10,}',
        [Parameter()]
        [bool]$CheckPathnames = $false,
        [Parameter()]
        [bool]$DisallowSpaces = $false,
        [Parameter()]
        [string]$WebhookUrl = $null
    )
    $repo = Get-SvnRepository -Name $RepositoryName
    if (-not $repo) { throw "Repository '$RepositoryName' not found." }

    $body = @{
        is_enabled = $IsEnabled
        check_commit_message = $CheckCommitMessage
        commit_message_pattern = $CommitMessagePattern
        check_pathnames = $CheckPathnames
        disallow_spaces = $DisallowSpaces
        webhook_enabled = ($WebhookUrl -ne $null -and $WebhookUrl -ne '')
        webhook_url = $WebhookUrl
    } | ConvertTo-Json

    Invoke-RestMethod -Uri "$script:NuviApiBase/operations/hooks/$($repo.id)/$HookName" -Method Put -Body $body -ContentType "application/json"
}

function Export-SvnReplicationSeed {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true, Position=0)]
        [string]$RepositoryName
    )
    $repo = Get-SvnRepository -Name $RepositoryName
    if (-not $repo) { throw "Repository '$RepositoryName' not found." }
    Invoke-RestMethod -Uri "$script:NuviApiBase/operations/replication/export-seed/$($repo.id)" -Method Post
}
