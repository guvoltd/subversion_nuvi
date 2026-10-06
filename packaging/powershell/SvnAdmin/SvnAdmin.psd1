@{
    # Script module or binary module file associated with this manifest.
    RootModule = 'SvnAdmin.psm1'

    # Version number of this module.
    ModuleVersion = '1.16.1'

    # Supported PSEditions
    CompatiblePSEditions = @('Core', 'Desktop')

    # ID used to uniquely identify this module
    GUID = 'a47b19dc-6902-4fc4-bc8c-98ef7394d131'

    # Author of this module
    Author = 'Subversion Nuvi Team'

    # Company or vendor of this module
    CompanyName = 'Subversion Nuvi Enterprise'

    # Description of the functionality provided by this module
    Description = 'Cross-platform PowerShell module for administering Subversion Nuvi servers, matching VisualSVN PowerShell cmdlet signatures.'

    # Functions to export from this module
    FunctionsToExport = @(
        'Get-SvnServerStatus',
        'Get-SvnRepository',
        'New-SvnRepository',
        'Remove-SvnRepository',
        'Test-SvnRepository',
        'Get-SvnUser',
        'New-SvnUser',
        'Set-SvnUserPassword',
        'Remove-SvnUser',
        'Get-SvnGroup',
        'New-SvnGroup',
        'Add-SvnGroupMember',
        'Remove-SvnGroupMember',
        'Get-SvnAccessRule',
        'Add-SvnAccessRule',
        'Remove-SvnAccessRule',
        'Test-SvnEffectiveAccess',
        'Backup-SvnRepository',
        'Test-SvnRepositoryBackup',
        'Restore-SvnRepository',
        'Get-SvnHookConfig',
        'Set-SvnHookConfig',
        'Export-SvnReplicationSeed'
    )

    # Cmdlets to export from this module
    CmdletsToExport = @()

    # Variables to export from this module
    VariablesToExport = '*'

    # Aliases to export from this module
    AliasesToExport = @()

    # Private data to pass to the module specified in RootModule
    PrivateData = @{
        PSData = @{
            Tags = @('SVN', 'Subversion', 'VisualSVN', 'SvnAdmin', 'VDFS', 'VersionControl')
            ProjectUri = 'https://github.com/nuvi/subversion-nuvi'
        }
    }
}
