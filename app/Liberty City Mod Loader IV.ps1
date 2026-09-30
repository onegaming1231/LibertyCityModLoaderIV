# ============================================================================
#  LIBERTY CITY MOD LOADER IV
#  A Fusion Overloader-friendly mod installer for GTA IV: The Complete Edition
#  - keeps your original game files untouched (mods go to update\<ModName>)
#  - sends scripts to scripts\, plugins and their files to the game folder
#  - backs up anything it replaces, warns about conflicts, uninstalls cleanly
# ============================================================================
param([string]$ModPath = "")
# the app folder (when Liberty City Mod Loader IV.exe runs this script itself, it says where)
$APP_DIR = $(if ($PSScriptRoot) { $PSScriptRoot } elseif ($env:LCMI_APPDIR) { $env:LCMI_APPDIR } else { (Get-Location).Path })

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.Windows.Forms.Application]::EnableVisualStyles()

# UI library: smooth animations, rounded buttons/cards, dark lists, bundled fonts, own taskbar icon.
# Loaded from bytes so Windows' "downloaded file" block doesn't stop it. If it can't load, the app
# builds it from LibertyUI.cs, and if that fails too it simply uses plain Windows controls.
$APP_ID = "LibertyCity.ModInstaller"
$script:UI = $false
try {
    $uiDll = Join-Path $APP_DIR "LibertyUI.dll"
    if (Test-Path $uiDll) { [void][System.Reflection.Assembly]::Load([System.IO.File]::ReadAllBytes($uiDll)) }
    $script:UI = [bool]("LCMI.Anim" -as [type])
} catch { $script:UI = $false }
if (-not $script:UI -and (Test-Path (Join-Path $APP_DIR "LibertyUI.cs"))) {
    try {
        $uiSrc = Join-Path $APP_DIR "LibertyUI.cs"
        $uiDir = Join-Path ([Environment]::GetFolderPath("ApplicationData")) "LibertyCityModInstaller"
        if (-not (Test-Path $uiDir)) { New-Item -ItemType Directory $uiDir -Force | Out-Null }
        $uiOut = Join-Path $uiDir ("LibertyUI-" + (Get-Item $uiSrc).Length + "-" + $(if ([Environment]::Is64BitProcess) { "x64" } else { "x86" }) + ".dll")
        if (-not (Test-Path $uiOut)) {
            Add-Type -TypeDefinition (Get-Content $uiSrc -Raw) -ReferencedAssemblies System.Windows.Forms, System.Drawing, WindowsBase -OutputAssembly $uiOut -OutputType Library -ErrorAction Stop
        }
        [void][System.Reflection.Assembly]::Load([System.IO.File]::ReadAllBytes($uiOut))
        $script:UI = [bool]("LCMI.Anim" -as [type])
    } catch { $script:UI = $false }
}
# running from Liberty City Mod Loader IV.exe: Windows uses that program's own name and icon on the taskbar.
# Only when started another way (the .bat, inside powershell.exe) does the app need its own taskbar ID.
$OWN_EXE = [bool]$env:LCMI_EXE -and ([Diagnostics.Process]::GetCurrentProcess().ProcessName -notmatch '^(powershell|pwsh)$')
if ($script:UI) {
    if (-not $OWN_EXE) { try { [LCMI.Taskbar]::SetProcessId($APP_ID) } catch { } }
    $fontDir = Join-Path $APP_DIR "fonts"
    if (Test-Path $fontDir) { Get-ChildItem $fontDir -Filter *.ttf | ForEach-Object { [void][LCMI.Fonts]::Load($_.FullName) } }
}
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; [Net.ServicePointManager]::Expect100Continue = $false; [Net.ServicePointManager]::DefaultConnectionLimit = 16 } catch { }
$APP_VERSION = "1.0"

# any unexpected error: tell the user once and keep a log they can share
trap {
    try { Add-Content -Path (Join-Path $env:TEMP "LibertyCityModInstaller.log") -Value ((Get-Date).ToString("s") + "  " + $_.ToString() + "  " + $_.InvocationInfo.PositionMessage) } catch { }
    if (-not $script:ErrShown) {
        $script:ErrShown = $true
        [System.Windows.Forms.MessageBox]::Show("Something went wrong:`n`n" + $_.ToString() + "`n`nDetails were saved to %TEMP%\LibertyCityModInstaller.log", "Liberty City Mod Loader IV", "OK", "Error") | Out-Null
    }
    continue
}
# errors inside buttons and other clicks: log them and show a short message instead of the big .NET box
try { [System.Windows.Forms.Application]::SetUnhandledExceptionMode([System.Windows.Forms.UnhandledExceptionMode]::CatchException) } catch { }
[System.Windows.Forms.Application]::add_ThreadException({
    param($s, $e)
    $msg = $e.Exception.Message
    try { Add-Content -Path (Join-Path $env:TEMP "LibertyCityModInstaller.log") -Value ((Get-Date).ToString("s") + "  " + $e.Exception.ToString()) } catch { }
    [System.Windows.Forms.MessageBox]::Show("That didn't work:`n`n" + $msg + "`n`nDetails were saved to %TEMP%\LibertyCityModInstaller.log", "Liberty City Mod Loader IV", "OK", "Warning") | Out-Null
})

# ----------------------------------------------------------------------------
#  Look and feel
# ----------------------------------------------------------------------------
$C_BG      = [System.Drawing.Color]::FromArgb(17, 18, 20)
$C_PANEL   = [System.Drawing.Color]::FromArgb(27, 29, 33)
$C_PANEL2  = [System.Drawing.Color]::FromArgb(36, 38, 44)
$C_TEXT    = [System.Drawing.Color]::FromArgb(230, 230, 230)
$C_DIM     = [System.Drawing.Color]::FromArgb(150, 150, 158)
$C_BLUE    = [System.Drawing.Color]::FromArgb(108, 164, 216)   # GTA IV HUD blue
$C_AMBER   = [System.Drawing.Color]::FromArgb(224, 182, 76)
$C_RED     = [System.Drawing.Color]::FromArgb(217, 83, 79)
$C_GREEN   = [System.Drawing.Color]::FromArgb(120, 190, 120)

function New-Font($names, [float]$size, $style = [System.Drawing.FontStyle]::Regular) {
    if ($script:UI) {
        foreach ($n in $names) { $f = [LCMI.Fonts]::Make($n, $size, $style); if ($f) { return $f } }
    }
    foreach ($n in $names) {
        $f = New-Object System.Drawing.Font($n, $size, $style)
        if ($f.Name -eq $n) { return $f }
    }
    return New-Object System.Drawing.Font("Segoe UI", $size, $style)
}
# Bebas Neue for titles, Barlow / Barlow Condensed for everything else (bundled in app\fonts)
$F_LOGO  = New-Font @("Bebas Neue", "Impact") 36
$F_SUB   = New-Font @("Barlow Condensed SemiBold", "Arial Narrow", "Segoe UI") 12.5 ([System.Drawing.FontStyle]::Bold)
$F_BODY  = New-Font @("Barlow", "Segoe UI") 10
$F_BOLD  = New-Font @("Barlow SemiBold", "Segoe UI") 10 ([System.Drawing.FontStyle]::Bold)
$F_HEAD  = New-Font @("Bebas Neue", "Arial Narrow", "Segoe UI") 20 ([System.Drawing.FontStyle]::Bold)
$F_SMALL = New-Font @("Barlow", "Segoe UI") 9
$F_BTN   = New-Font @("Barlow Condensed SemiBold", "Segoe UI") 11.5 ([System.Drawing.FontStyle]::Bold)
$F_COL   = New-Font @("Barlow Condensed SemiBold", "Segoe UI") 10 ([System.Drawing.FontStyle]::Bold)
$F_NAVSUB = New-Font @("Barlow", "Segoe UI") 9

$TAGLINES = @(
    "Welcome to Liberty City. The land of opportunity.",
    "Cousin! Your mods have arrived!",
    "Weazel News: Local man installs mods. City unharmed.",
    "Brucie approved. This installer is fully alpha.",
    "Grab a Cluckin' Bell bucket while the files copy.",
    "Sprunk: the official drink of mod installing.",
    "LCPD reminds you: back up your saves.",
    "Take the Algonquin Bridge. Skip the scenic route.",
    "Packie says: clean job, no loose ends.",
    "Now broadcasting live from Star Junction.",
    "From the docks of Broker to the hills of Alderney.",
    "Another shipment through the Port of Liberty."
)

# ----------------------------------------------------------------------------
#  State
# ----------------------------------------------------------------------------
$script:Game = ""
$script:Plan = @()          # rows: Source, Dest (relative to game), Kind, Note
$script:PlanMod = ""
$script:PlanTemp = ""
$DOC_EXT  = @(".url", ".htm", ".html", ".pdf", ".rtf", ".lnk")
$DATA_EXT = @(".wtd", ".wdr", ".wft", ".wdd", ".wbd", ".wbn", ".wpl", ".ide", ".ipl", ".wad", ".wvd", ".wfd", ".nod", ".sco", ".rpf", ".whm", ".gxt", ".dat", ".xml", ".csv", ".wav", ".bik")
$ROOTS    = @("pc", "common", "tlad", "tbogt", "movies")
$IMG_EXT  = @(".wft", ".wtd", ".wdr", ".wdd", ".wbd", ".wbn")
# well-known game files that mods often ship loose, without their folder path
$KNOWN_PATHS = @{
    "playerped.rpf"     = "pc\models\cdimages\playerped.rpf"
    "componentpeds.img" = "pc\models\cdimages\componentpeds.img"
    "streamedpeds.img"  = "pc\models\cdimages\streamedpeds.img"
    "pedprops.img"      = "pc\models\cdimages\pedprops.img"
    "vehicles.img"      = "pc\models\cdimages\vehicles.img"
    "weapons.img"       = "pc\models\cdimages\weapons.img"
    "handling.dat"      = "common\data\handling.dat"
    "carcols.dat"       = "common\data\carcols.dat"
    "vehicles.ide"      = "common\data\vehicles.ide"
    "peds.ide"          = "common\data\peds.ide"
    "weaponinfo.xml"    = "common\data\weaponinfo.xml"
    "visualsettings.dat"= "common\data\visualsettings.dat"
    "timecyc.dat"       = "pc\data\timecyc.dat"
}
$WRAPPERS = @("d3d9.dll", "dxgi.dll", "d3d11.dll", "opengl32.dll", "dinput8.dll")
$LAUNCHERS = @("gtaiv.exe", "playgtaiv.exe", "eflc.exe", "launcheflc.exe", "launchgtaiv.exe")
$FF_URL   = "https://github.com/ThirteenAG/GTAIV.EFLC.FusionFix/releases/latest/download/GTAIV.EFLC.FusionFix.zip"
$MODEL_EXT = @(".wtd", ".wdr", ".wft", ".wdd", ".wbd", ".wbn", ".wpl", ".ide", ".ipl", ".wad", ".wvd", ".wfd", ".nod", ".sco", ".rpf", ".img")

# ----------------------------------------------------------------------------
#  Game folder and mod database
# ----------------------------------------------------------------------------
function Find-Game {
    $candidates = @()
    try {
        $steam = (Get-ItemProperty "HKCU:\Software\Valve\Steam" -ErrorAction Stop).SteamPath
        if ($steam) {
            $steam = $steam -replace "/", "\"
            $candidates += Join-Path $steam "steamapps\common\Grand Theft Auto IV\GTAIV"
            $vdf = Join-Path $steam "steamapps\libraryfolders.vdf"
            if (Test-Path $vdf) {
                foreach ($m in [regex]::Matches((Get-Content $vdf -Raw), '"path"\s+"([^"]+)"')) {
                    $lib = $m.Groups[1].Value -replace "\\\\", "\"
                    $candidates += Join-Path $lib "steamapps\common\Grand Theft Auto IV\GTAIV"
                }
            }
        }
    } catch { }
    $candidates += "C:\Program Files (x86)\Steam\steamapps\common\Grand Theft Auto IV\GTAIV"
    $candidates += "C:\Program Files (x86)\Rockstar Games\Grand Theft Auto IV"
    foreach ($c in $candidates) { if (Test-Path (Join-Path $c "GTAIV.exe")) { return $c } }
    return ""
}

function Get-DataDir {
    if ($script:DataDirOf -eq $script:Game -and $script:DataDir -and [IO.Directory]::Exists($script:DataDir)) { return $script:DataDir }
    $d = Join-Path $script:Game "LCModInstaller"; if (-not (Test-Path $d)) { New-Item -ItemType Directory $d | Out-Null }
    $script:DataDir = $d; $script:DataDirOf = $script:Game
    return $d
}
function Get-DbPath { return Join-Path (Get-DataDir) "mods.json" }

# the mod list is read from disk only when the file changed (reading a big list is slow)
function Get-DbSig($p) { try { $fi = New-Object IO.FileInfo($p); if (-not $fi.Exists) { return "" }; return "" + $fi.Length + "|" + $fi.LastWriteTimeUtc.Ticks } catch { return "" } }
function Load-Db {
    $p = Get-DbPath
    if (-not [IO.File]::Exists($p)) { return @() }
    $sig = Get-DbSig $p
    if ($script:DbCacheSig -and $script:DbCachePath -eq $p -and $script:DbCacheSig -eq $sig) { return @($script:DbCache) }
    $list = @()
    try { $x = [IO.File]::ReadAllText($p) | ConvertFrom-Json; if ($null -ne $x) { $list = @($x) } } catch { $list = @() }
    $script:DbCache = $list; $script:DbCachePath = $p; $script:DbCacheSig = $sig
    return @($list)
}

function Save-Db($mods) {
    $p = Get-DbPath
    $json = ConvertTo-Json -InputObject @($mods) -Depth 6
    Set-Content -Path $p -Value $json -Encoding UTF8
    $script:DbCache = @($mods); $script:DbCachePath = $p; $script:DbCacheSig = Get-DbSig $p
}

function Test-ModOn($m) { return -not ($m.PSObject.Properties["Enabled"] -and $m.Enabled -eq $false) }

function Get-Owner($rel, $mods) {
    foreach ($m in $mods) { if (-not (Test-ModOn $m)) { continue }; foreach ($f in @($m.Files)) { if ($f -ieq $rel) { return $m.Name } } }
    return $null
}

# ----------------------------------------------------------------------------
#  Mod library: every mod keeps its own copy of all its files in
#  LCModInstaller\library\<Mod>. The game folder only gets the files of mods
#  that are on. When two mods have the same file, the one lower in My Mods wins.
#  The file that was there before any mod is kept in LCModInstaller\replaced.
#  So turning mods on/off in any order, any time later, always puts the right
#  files back. (Same drive = hard links, so no extra disk space is used.)
# ----------------------------------------------------------------------------
function Test-InLibrary($m) { return ($m -and ($m.PSObject.Properties.Name -contains "Library") -and $m.Library) }
function Get-LibFile($name, $rel) { return Join-Path (Get-DataDir) ("library\" + $name + "\" + $rel) }
function Get-ReplacedFile($rel) { return Join-Path (Get-DataDir) ("replaced\" + $rel) }
function Get-DeployedPath { return Join-Path (Get-DataDir) "deployed.json" }
function Load-Deployed {
    $h = @{}
    $p = Get-DeployedPath
    if (Test-Path -LiteralPath $p) {
        try { $o = Get-Content -LiteralPath $p -Raw | ConvertFrom-Json; foreach ($pr in @($o.PSObject.Properties)) { $h[$pr.Name.ToLower()] = [string]$pr.Value } } catch { }
    }
    return $h
}
function Save-Deployed($h) {
    $o = [ordered]@{}; foreach ($k in @($h.Keys | Sort-Object)) { $o[$k] = $h[$k] }
    try { ([pscustomobject]$o) | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Get-DeployedPath) -Encoding UTF8 } catch { }
}
function New-ParentDir($path) { $d = Split-Path $path -Parent; if ($d -and -not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory $d -Force | Out-Null } }
# puts a copy of $from at $to (a hard link when it can, otherwise a normal copy)
function Place-File($from, $to) {
    if (Test-Path -LiteralPath $to) { Remove-Item -LiteralPath $to -Force }
    New-ParentDir $to
    $linked = $false
    if ($script:UI) { try { $linked = [LCMI.Files]::HardLink($to, $from) } catch { $linked = $false } }
    if (-not $linked) { Copy-Item -LiteralPath $from -Destination $to -Force }
}
function Test-SameFile($a, $b) {
    try {
        $x = Get-Item -LiteralPath $a -Force; $y = Get-Item -LiteralPath $b -Force
        return ($x.Length -eq $y.Length -and $x.LastWriteTimeUtc -eq $y.LastWriteTimeUtc)
    } catch { return $false }
}
# which mods have which file (built once per sync, so big mods stay fast)
function Get-FileIndex($mods) {
    $ix = @{}
    $all = @($mods)
    for ($i = 0; $i -lt $all.Count; $i++) {
        foreach ($f in @($all[$i].Files)) { if (-not $f) { continue }; $k = ([string]$f).ToLower(); if (-not $ix.ContainsKey($k)) { $ix[$k] = New-Object System.Collections.ArrayList }; [void]$ix[$k].Add($i) }
    }
    return $ix
}
# the mod whose version of this file should be in the game now (on, and lowest in the list)
function Get-Winner($rel, $mods, $ix = $null) {
    $all = @($mods)
    if ($null -eq $ix) { $ix = Get-FileIndex $all }
    $k = ([string]$rel).ToLower()
    if (-not $ix.ContainsKey($k)) { return $null }
    $list = $ix[$k]
    for ($j = $list.Count - 1; $j -ge 0; $j--) {
        $m = $all[$list[$j]]
        if ((Test-ModOn $m) -and (Test-InLibrary $m) -and [IO.File]::Exists((Get-LibFile $m.Name $rel))) { return $m }
    }
    return $null
}
# archives the app builds a modded copy of (in update\LC Installer Archives) - any whole copy a mod ships
# of the same archive is kept out of the game then, and the modded copy is built on top of it instead
function Get-BuiltArchives($mods) {
    $h = @{}
    foreach ($m in @($mods)) { if (Test-ModOn $m) { foreach ($it in (Get-ModArchives $m)) { $h[([string]$it.Archive).ToLower()] = $true } } }
    return $h
}
function Test-WholeArchiveCopy([string]$rel) {
    return ($rel -match '(?i)^update\\' -and $rel -notmatch '(?i)^update\\LC Installer Archives\\' -and $rel -match '(?i)\.(rpf|img)$')
}
# ---- data lists (gta.dat, images.txt, default.dat): mods only ADD lines, they never replace the whole file ----
# The game's own file + the new lines of every mod that's on = one combined file in update\common\data
# (Fusion Fix only reads these lists from there). A line that points to a file that doesn't exist is left out.
$DATA_DIR = "update\LC Installer Data"      # old place of the combined files - cleaned up
$MERGE_TARGETS = @("common\data\gta.dat", "common\data\images.txt", "common\data\default.dat")
# ---- car / ped data (handling.dat, vehicles.ide, peds.ide, carcols.dat, cargrp.dat, pedgrp.dat) ----
# The game's own file + every mod's lines = one combined file in update\common\data. A line for a car or ped the
# game already has replaces that line (the mod lower in My Mods wins); a new one is added in the right section.
# Nothing is ever edited by hand, and turning the mod off takes its lines out again.
$KEYED = [ordered]@{
    "common\data\handling.dat" = "handling"
    "common\data\vehicles.ide" = "ide:cars"
    "common\data\peds.ide"     = "ide:peds"
    "common\data\carcols.dat"  = "ide:"
    "common\data\cargrp.dat"   = "grp"
    "common\data\pedgrp.dat"   = "grp"
}
$MERGE_TARGETS = @($MERGE_TARGETS + @($KEYED.Keys))
# a mod's notes file with blocks like "# handling.dat" followed by the lines to add - read and added for you
$LINE_FILES = @{}
foreach ($t in $MERGE_TARGETS) { $LINE_FILES[(Split-Path $t -Leaf)] = $t }
function Test-MergeCopy([string]$rel) {
    if ($rel -notmatch '(?i)^update\\' -or $rel -match '(?i)^update\\LC Installer (Data|Archives)\\') { return $false }
    if ($rel -match '(?i)^update\\(common|pc|tlad|tbogt)\\') { return $false }     # the combined file itself
    return ($MERGE_TARGETS -contains (Get-GamePath $rel))
}
# data files (.ide, .dat, lists...) must sit at their real path in update\ - Fusion Fix doesn't read them from a mod's own folder
function Test-DataPath([string]$gamePath) {
    $gp = $gamePath.ToLower()
    return (($gp -match '^(tlad\\|tbogt\\)?(common|pc)\\data\\') -and ($MERGE_TARGETS -notcontains $gp))
}
function Get-UpdateDest([string]$mod, [string]$gamePath) {
    if (Test-DataPath $gamePath) { return ("update\" + $gamePath) }
    return ("update\$mod\" + $gamePath)
}
function Get-LineKey([string]$l) { return (($l.Trim() -replace '\s+', ' ').ToLower()) }
# does the file a data line points to exist (in the game or in any mod)?
function Test-LineTarget([string]$line, $known) {
    $m = [regex]::Match($line, '(?i)(common|platform|pc):/([^\s,]+)')
    if (-not $m.Success) { return $true }                      # no path in it - keep
    $root = $(if ($m.Groups[1].Value -ieq "common") { "common" } else { "pc" })
    $p = ($root + "\" + ($m.Groups[2].Value -replace '/', '\')).ToLower()
    foreach ($c in @($p, ($p + ".img"), ($p + ".ide"), ($p + ".ipl"), ($p + ".wpl"), ($p + ".dat"))) {
        if ($known.ContainsKey($c) -or [IO.File]::Exists((Join-Path $script:Game $c))) { return $true }
    }
    return $false
}
function Get-KeyedKey([string]$kind, [string]$t) {
    if ($kind -eq "handling") { $tk = @($t -split '\s+'); if ($tk[0] -match '^[%!$^]$' -and $tk.Count -gt 1) { return ($tk[0] + " " + $tk[1]).ToLower() }; return $tk[0].ToLower() }
    return ((($t -split ',')[0].Trim()) -split '\s+')[0].ToLower()
}
function Find-Section($lines, [string]$name) {
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if (([string]$lines[$i]).Trim() -ieq $name) {
            for ($j = $i + 1; $j -lt $lines.Count; $j++) { if (([string]$lines[$j]).Trim() -ieq "end") { return @($i, $j) } }
            return @($i, $lines.Count)
        }
    }
    return $null
}
# puts one mod's lines into the combined file ($lines): same car/ped = replaced, new = added in its section
function Merge-Keyed([string]$kind, $lines, [string]$srcPath, [string]$defSection) {
    $changed = 0
    $sec = $defSection
    foreach ($raw in [IO.File]::ReadAllLines($srcPath)) {
        $t = $raw.Trim()
        if (-not $t) { continue }
        if ($kind -eq "handling") {
            if ($t.StartsWith(";") -or $t.StartsWith("#")) { continue }
            if (@($t -split '\s+').Count -lt 10) { continue }
            $k = Get-KeyedKey $kind $t; $at = -1; $lastData = -1; $lastSame = -1
            $pre = $(if ($t[0] -match '[%!$^]') { [string]$t[0] } else { "" })      # boats %, bikes !, planes $, extras ^
            for ($i = 0; $i -lt $lines.Count; $i++) {
                $b = ([string]$lines[$i]).Trim()
                if (-not $b -or $b.StartsWith(";") -or $b.StartsWith("#")) { continue }
                $lastData = $i
                if ($(if ($b[0] -match '[%!$^]') { [string]$b[0] } else { "" }) -eq $pre) { $lastSame = $i }
                if ($at -lt 0 -and (Get-KeyedKey $kind $b) -eq $k) { $at = $i }
            }
            if ($at -ge 0) { if (([string]$lines[$at]).Trim() -ne $t) { $lines[$at] = $t; $changed++ } }
            else { $lines.Insert($(if ($lastSame -ge 0) { $lastSame } else { $lastData }) + 1, $t); $changed++ }
            continue
        }
        if ($kind -eq "grp") {
            # "coach, # POPCYCLE_GROUP_AIRPORT_WORKERS" = add coach to that group's line
            $h = $t.IndexOf("#"); if ($h -lt 1) { continue }
            $label = @(($t.Substring($h + 1).Trim()) -split '\s+')[0]
            if (-not $label) { continue }
            $names = @($t.Substring(0, $h).Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^[A-Za-z0-9_]+$' })
            if ($names.Count -eq 0) { continue }
            for ($i = 0; $i -lt $lines.Count; $i++) {
                $b = [string]$lines[$i]; $bh = $b.IndexOf("#"); if ($bh -lt 1) { continue }
                if (@(($b.Substring($bh + 1).Trim()) -split '\s+')[0] -ine $label) { continue }
                $have = @($b.Substring(0, $bh).Split(",") | ForEach-Object { $_.Trim().ToLower() })
                $new = @($names | Where-Object { $have -notcontains $_.ToLower() })
                if ($new.Count -gt 0) { $lines[$i] = ($new -join ", ") + ", " + $b.TrimStart(); $changed++ }
                break
            }
            continue
        }
        # vehicles.ide / peds.ide / carcols.dat: sections like "cars" ... "end"
        if ($t.StartsWith("#")) { continue }
        if ($t -match '^[A-Za-z][A-Za-z0-9_]*$') { if ($t -ieq "end") { $sec = $defSection } else { $sec = $t.ToLower() }; continue }
        $k = Get-KeyedKey $kind $t
        $useSec = $sec
        if (-not $useSec) {
            # a carcols line without its section: the car's own section if the game has it, else 4 numbers per colour = car4
            $nums = @(($t -split ',') | Select-Object -Skip 1 | Where-Object { $_.Trim() -match '^\d+$' }).Count
            $useSec = $(if ($nums -gt 0 -and $nums % 4 -eq 0) { "car4" } else { "car3" })
            foreach ($cand in @("car3", "car4")) {
                $r = Find-Section $lines $cand
                if ($r) { for ($i = $r[0] + 1; $i -lt $r[1]; $i++) { $b = ([string]$lines[$i]).Trim(); if ($b -and -not $b.StartsWith("#") -and (Get-KeyedKey $kind $b) -eq $k) { $useSec = $cand } } }
            }
        }
        $r = Find-Section $lines $useSec
        if (-not $r) { [void]$lines.Add(""); [void]$lines.Add($useSec); [void]$lines.Add($t); [void]$lines.Add("end"); $changed++; continue }
        $at = -1
        for ($i = $r[0] + 1; $i -lt $r[1]; $i++) {
            $b = ([string]$lines[$i]).Trim()
            if (-not $b -or $b.StartsWith("#")) { continue }
            if ($useSec -eq "col") { if ((Get-LineKey $b) -eq (Get-LineKey $t)) { $at = $i; break }; continue }
            if ((Get-KeyedKey $kind $b) -eq $k) { $at = $i; break }
        }
        if ($at -ge 0) { if (([string]$lines[$at]).Trim() -ne $t) { $lines[$at] = $t; $changed++ } }
        else { $lines.Insert($r[1], $t); $changed++ }
    }
    return $changed
}
function Rebuild-Merges($mods = $null) {
    if (-not $script:Game) { return }
    if ($null -eq $mods) { $mods = @(Load-Db) }
    $outRoot = Join-Path $script:Game "update"
    $oldRoot = Join-Path $script:Game $DATA_DIR
    if (Test-Path -LiteralPath $oldRoot) { try { Remove-Item -LiteralPath $oldRoot -Recurse -Force } catch { } }
    $mark = Join-Path (Get-DataDir) "merged.txt"      # the combined files we wrote (only these are ever removed)
    $ours = @{}; if ([IO.File]::Exists($mark)) { foreach ($l in [IO.File]::ReadAllLines($mark)) { if ($l) { $ours[$l.ToLower()] = $true } } }
    $known = $null
    foreach ($target in $MERGE_TARGETS) {
        $srcs = @()
        foreach ($m in @($mods)) {
            if (-not (Test-ModOn $m)) { continue }
            foreach ($f in @($m.Files | Where-Object { $_ -and (Test-MergeCopy ([string]$_)) -and (Get-GamePath ([string]$_)) -eq $target })) {
                $p = $(if (Test-InLibrary $m) { Get-LibFile $m.Name ([string]$f) } else { Join-Path $script:Game ([string]$f) })
                if ([IO.File]::Exists($p)) { $srcs += [pscustomobject]@{ Mod = [string]$m.Name; Path = $p } }
            }
        }
        $out = Join-Path $outRoot $target
        $orig = Join-Path $script:Game $target
        $keepRp = Get-ReplacedFile ("update\" + $target)     # a copy that was there before the app combined this file
        if ($srcs.Count -eq 0 -or -not [IO.File]::Exists($orig)) {
            if ($ours.ContainsKey($target) -and [IO.File]::Exists($out)) { Remove-Item -LiteralPath $out -Force; Remove-EmptyDirs (Split-Path $out -Parent) }
            if ($ours.ContainsKey($target) -and $KEYED.Contains($target) -and [IO.File]::Exists($keepRp)) { New-ParentDir $out; Move-Item -LiteralPath $keepRp -Destination $out -Force }
            $ours.Remove($target)
            continue
        }
        if ($null -eq $known) {
            # every file any mod puts in the game (so an add-on's new .ide/.img counts as existing)
            $known = @{}
            foreach ($mm in @($mods)) { if (Test-ModOn $mm) { foreach ($f in @($mm.Files)) { if ($f) { $known[(Get-GamePath ([string]$f))] = $true } } } }
        }
        $lines = New-Object System.Collections.ArrayList
        $skipped = @()
        if ($KEYED.Contains($target)) {
            # start from what the game uses now: its own file, or a copy someone put in update\common\data before
            if (-not $ours.ContainsKey($target) -and [IO.File]::Exists($out) -and -not [IO.File]::Exists($keepRp)) { New-ParentDir $keepRp; Copy-Item -LiteralPath $out -Destination $keepRp -Force }
            $base = $(if ([IO.File]::Exists($keepRp)) { $keepRp } else { $orig })
            foreach ($l in [IO.File]::ReadAllLines($base)) { [void]$lines.Add($l) }
            $def = [string]$KEYED[$target]
            $kind = $def.Split(":")[0]; $sec = $(if ($def.Contains(":")) { $def.Split(":")[1] } else { "" })
            foreach ($s in $srcs) { try { [void](Merge-Keyed $kind $lines $s.Path $sec) } catch { $skipped += ($s.Mod + ": " + $_.Exception.Message) } }
            $srcs = @()
        } else {
            foreach ($l in [IO.File]::ReadAllLines($orig)) { [void]$lines.Add($l) }
        }
        $have = @{}; foreach ($l in $lines) { $have[(Get-LineKey $l)] = $true }
        foreach ($s in $srcs) {
            foreach ($l in [IO.File]::ReadAllLines($s.Path)) {
                $k = Get-LineKey $l
                if (-not $k -or $k.StartsWith("#") -or $have.ContainsKey($k)) { continue }
                if (-not (Test-LineTarget $l $known)) { $skipped += ($s.Mod + ": " + $l.Trim()); continue }
                # put it after the last line of the same kind (IDE with IDE, IMG with IMG...), otherwise at the end
                $kw = ($l.Trim() -split '\s+')[0]
                $at = -1
                for ($i = $lines.Count - 1; $i -ge 0; $i--) { if ((([string]$lines[$i]).Trim() -split '\s+')[0] -ieq $kw) { $at = $i; break } }
                if ($at -ge 0) { $lines.Insert($at + 1, $l.Trim()) } else { [void]$lines.Add($l.Trim()) }
                $have[$k] = $true
            }
        }
        New-ParentDir $out
        $text = ($lines -join "`r`n") + "`r`n"
        if (-not [IO.File]::Exists($out) -or [IO.File]::ReadAllText($out) -ne $text) { [IO.File]::WriteAllText($out, $text, (New-Object Text.ASCIIEncoding)) }
        $ours[$target] = $true
        if ($skipped.Count -gt 0) { try { Add-Content (Join-Path (Get-DataDir) "merges.log") ((Get-Date).ToString("s") + "  left out (file not found): " + ($skipped -join " | ")) } catch { } }
    }
    try { [IO.File]::WriteAllLines($mark, [string[]]@($ours.Keys)) } catch { }
}

# ---- trainer lists: new characters/cars from add-on mods are added to your trainer's add-on list ----
# (Liberty's Legacy: Lists\addon_ped_models.txt and addon_vehicle_models.txt). Only names the app added are ever removed.
function Get-IdeNames([string]$path, [string]$section) {
    $names = @()
    $in = $false
    foreach ($l in [IO.File]::ReadAllLines($path)) {
        $t = $l.Trim()
        if (-not $t -or $t.StartsWith("#")) { continue }
        if (-not $in) { if ($t -ieq $section) { $in = $true }; continue }
        if ($t -ieq "end") { $in = $false; continue }
        $n = ($t -split ',')[0].Trim()
        if ($n -match '^[A-Za-z0-9_]+$') { $names += $n }
    }
    return $names
}
function Update-TrainerLists($mods = $null) {
    if (-not $script:Game) { return }
    $ll = Join-Path $script:Game "Liberty's Legacy\Lists"
    if (-not (Test-Path -LiteralPath $ll)) { return }
    if ($null -eq $mods) { $mods = @(Load-Db) }
    $base = @{ peds = @{}; cars = @{} }
    foreach ($ep in @("", "tlad\", "tbogt\")) {
        foreach ($pair in @(@("peds", "peds.ide"), @("cars", "vehicles.ide"))) {
            $bf = Join-Path $script:Game ($ep + "common\data\" + $pair[1])
            if ([IO.File]::Exists($bf)) { try { foreach ($n in (Get-IdeNames $bf $pair[0])) { $base[$pair[0]][$n.ToLower()] = $true } } catch { } }
        }
    }
    $want = @{ peds = New-Object System.Collections.ArrayList; cars = New-Object System.Collections.ArrayList }
    foreach ($m in @($mods)) {
        if (-not (Test-ModOn $m)) { continue }
        foreach ($f in @($m.Files | Where-Object { $_ -and ([string]$_) -match '(?i)\.ide$' })) {
            $pth = $(if (Test-InLibrary $m) { Get-LibFile $m.Name ([string]$f) } else { Join-Path $script:Game ([string]$f) })
            if (-not [IO.File]::Exists($pth)) { continue }
            foreach ($sec in @("peds", "cars")) {
                try { foreach ($n in (Get-IdeNames $pth $sec)) { if (-not $base[$sec].ContainsKey($n.ToLower()) -and @($want[$sec]) -inotcontains $n) { [void]$want[$sec].Add($n) } } } catch { }
            }
        }
    }
    $mark = Join-Path (Get-DataDir) "trainer-added.txt"
    $ours = @{}; if ([IO.File]::Exists($mark)) { foreach ($l in [IO.File]::ReadAllLines($mark)) { if ($l) { $ours[$l.ToLower()] = $true } } }
    $newOurs = @()
    foreach ($pair in @(@("peds", "addon_ped_models.txt"), @("cars", "addon_vehicle_models.txt"))) {
        $lf = Join-Path $ll $pair[1]
        $lines = New-Object System.Collections.ArrayList
        if ([IO.File]::Exists($lf)) { foreach ($l in [IO.File]::ReadAllLines($lf)) { if ($l.Trim()) { [void]$lines.Add($l.Trim()) } } }
        $before = ($lines -join "`n")
        foreach ($l in @($lines)) { $k = $pair[0] + ":" + $l.ToLower(); if ($ours.ContainsKey($k) -and @($want[$pair[0]]) -inotcontains $l) { $lines.Remove($l) } }
        foreach ($n in $want[$pair[0]]) {
            $k = $pair[0] + ":" + $n.ToLower()
            if (@($lines) -icontains $n) { if ($ours.ContainsKey($k)) { $newOurs += $k }; continue }
            [void]$lines.Add($n); $newOurs += $k
        }
        if (($lines -join "`n") -ne $before) { try { [IO.File]::WriteAllText($lf, ((@($lines) -join "`r`n") + $(if ($lines.Count) { "`r`n" } else { "" }))) } catch { } }
    }
    try { [IO.File]::WriteAllLines($mark, [string[]]$newOurs) } catch { }
}

# makes the game folder match the list for these files
# Shader files in Fusion Fix's own folder (update\common\shaders\) always win over another mod's copy of the same
# shader - old shader mods are not made for Fusion Fix and make people invisible. Everything else: lower in My Mods wins.
function Get-CopyRank([string]$rel) {
    if ($rel -match '(?i)^update\\common\\shaders\\' -and $rel -match '(?i)\.fxc$') { return 1 }
    return 0
}

function Sync-Files($rels, $mods = $null) {
    if ($null -eq $mods) { $mods = @(Load-Db) }
    $dep = Load-Deployed
    $byName = @{}; foreach ($m in @($mods)) { $byName[([string]$m.Name).ToLower()] = $m }
    $ix = Get-FileIndex $mods
    $built = Get-BuiltArchives $mods
    # every mod file under update\, by the game file it stands for - so two mods giving the game the same file
    # (in different folders) are settled here: the one lower in My Mods wins, the other is kept out of the game
    $gpOwners = @{}
    $allMods = @($mods)
    $atOf = @{}; for ($mi = 0; $mi -lt $allMods.Count; $mi++) { $atOf[([string]$allMods[$mi].Name).ToLower()] = $mi }
    for ($mi = 0; $mi -lt $allMods.Count; $mi++) {
        $om = $allMods[$mi]
        if (-not (Test-InLibrary $om)) { continue }
        foreach ($f in @($om.Files)) {
            $fr = [string]$f
            if (-not $fr -or $fr -notmatch '(?i)^update\\' -or $fr -match '(?i)^update\\LC Installer') { continue }
            $gpk = Get-GamePath $fr
            if (-not $gpOwners.ContainsKey($gpk)) { $gpOwners[$gpk] = New-Object System.Collections.ArrayList }
            [void]$gpOwners[$gpk].Add([pscustomobject]@{ At = $mi; Rel = $fr; Mod = $om })
        }
    }
    # when one of them changes, its "twins" are checked too
    $more = @()
    foreach ($r in @($rels | Where-Object { $_ })) {
        $rr = [string]$r
        if ($rr -match '(?i)^update\\') { $gpk = Get-GamePath $rr; if ($gpOwners.ContainsKey($gpk)) { $more += @($gpOwners[$gpk] | ForEach-Object { $_.Rel }) } }
    }
    $rels = @(@($rels) + $more)
    foreach ($rel in @($rels | Where-Object { $_ } | ForEach-Object { [string]$_ } | Select-Object -Unique)) {
        if ($rel.Contains("|")) { continue }
        $key = $rel.ToLower()
        $dest = Join-Path $script:Game $rel
        $winner = Get-Winner $rel $mods $ix
        if ($winner -and (Test-WholeArchiveCopy $rel) -and $built.ContainsKey((Get-GamePath $rel))) { $winner = $null }   # the modded copy has it all
        if ($winner -and (Test-MergeCopy $rel)) { $winner = $null }                                                       # its new lines go into the combined file
        if ($winner -and $rel -match '(?i)^update\\' -and $rel -notmatch '(?i)^update\\LC Installer') {
            $gpk = Get-GamePath $rel
            if ($gpOwners.ContainsKey($gpk)) {
                $wAt = $atOf[([string]$winner.Name).ToLower()]
                $wPr = Get-CopyRank $rel
                foreach ($o in $gpOwners[$gpk]) {
                    if ($o.Rel -ieq $rel -or -not (Test-ModOn $o.Mod) -or -not [IO.File]::Exists((Get-LibFile $o.Mod.Name $o.Rel))) { continue }
                    $oPr = Get-CopyRank $o.Rel
                    if ($oPr -gt $wPr -or ($oPr -eq $wPr -and $o.At -gt $wAt)) { $winner = $null; break }   # a better copy (or a mod lower in the list) wins
                }
            }
        }
        $cur = $(if ($dep.ContainsKey($key)) { $dep[$key] } else { $null })
        $curMod = $(if ($cur) { $byName[$cur.ToLower()] } else { $null })
        $there = [IO.File]::Exists($dest)
        if ($there -and $curMod) {
            # settings you changed in the game folder (.ini and friends) are kept in that mod's copy
            $lf = Get-LibFile $curMod.Name $rel
            if ($rel -match '(?i)\.(ini|cfg|xml|txt|json|toml|conf|config)$' -and (Test-Path -LiteralPath $lf) -and -not (Test-SameFile $dest $lf)) {
                try { Copy-Item -LiteralPath $dest -Destination $lf -Force } catch { }
            }
        } elseif ($there -and -not $cur -and $winner) {
            # a file no mod put there (the original, or Fusion Fix's): keep it safe to put back later
            $rp = Get-ReplacedFile $rel
            if (Test-Path -LiteralPath $rp) { Remove-ToRecycleBin $dest }
            else { New-ParentDir $rp; Move-Item -LiteralPath $dest -Destination $rp -Force }
            $there = $false
        }
        if ($winner) {
            if (-not $there -or -not $cur -or $cur -ine $winner.Name) {
                try { Place-File (Get-LibFile $winner.Name $rel) $dest } catch { Set-Status ("Couldn't place " + $rel + ": " + $_.Exception.Message) $C_RED }
            }
            $dep[$key] = [string]$winner.Name
        } else {
            if ($there -and $cur) { Remove-Item -LiteralPath $dest -Force -ErrorAction SilentlyContinue }
            $rp = Get-ReplacedFile $rel
            if ($cur -and (Test-Path -LiteralPath $rp)) {
                New-ParentDir $dest
                Move-Item -LiteralPath $rp -Destination $dest -Force
                Remove-EmptyDirs (Split-Path $rp -Parent)
            } elseif ($cur) { Remove-EmptyDirs (Split-Path $dest -Parent) }
            $dep.Remove($key)
        }
    }
    Save-Deployed $dep
    if (@($rels | Where-Object { $_ -and (Test-MergeCopy ([string]$_)) }).Count -gt 0) { try { Rebuild-Merges $mods } catch { } }
    if (@($rels | Where-Object { $_ -and ([string]$_) -match '(?i)\.ide$' }).Count -gt 0) { try { Update-TrainerLists $mods } catch { } }
}
function Get-AllModFiles($mods) { return @(@($mods) | ForEach-Object { @($_.Files) } | Where-Object { $_ } | ForEach-Object { [string]$_ } | Sort-Object -Unique) }

# older versions kept parked files in "disabled" and replaced files in "backups": move them into the library once
function Convert-ToLibrary {
    if (-not $script:Game) { return }
    $mods = @(Load-Db)
    $old = @($mods | Where-Object { -not (Test-InLibrary $_) })
    if ($old.Count -eq 0) { return }
    Set-Status "Updating how your mods are stored (one time only)..." $C_DIM $false
    try { $form.Refresh() } catch { }
    $dep = Load-Deployed
    $data = Get-DataDir
    $ix = Get-FileIndex $mods
    for ($i = 0; $i -lt $mods.Count; $i++) {
        $m = $mods[$i]
        if (Test-InLibrary $m) { continue }
        $arcInner = @(Get-ModArchives $m | ForEach-Object { [string]$_.Inner })
        $files = @($m.Files | Where-Object { $_ -and $arcInner -notcontains [string]$_ } | ForEach-Object { [string]$_ })
        if (Test-ModOn $m) {
            foreach ($rel in $files) {
                $later = @($ix[$rel.ToLower()] | Where-Object { $_ -gt $i -and (Test-ModOn $mods[$_]) })
                if ($later.Count -gt 0) { continue }        # its version sits in the newer mod's backups (handled below)
                $p = Join-Path $script:Game $rel
                if (Test-Path -LiteralPath $p) { Place-File $p (Get-LibFile $m.Name $rel); $dep[$rel.ToLower()] = [string]$m.Name }
            }
        } else {
            $store = Join-Path $data ("disabled\" + $m.Name)
            foreach ($rel in $files) {
                $s = Join-Path $store $rel
                if (Test-Path -LiteralPath $s) { $lf = Get-LibFile $m.Name $rel; New-ParentDir $lf; Move-Item -LiteralPath $s -Destination $lf -Force }
            }
        }
        # what this mod replaced: an older mod's version, or the file from before any mod
        if (Test-ModOn $m) {
            foreach ($rel in @($m.Backups | Where-Object { $_ } | ForEach-Object { [string]$_ })) {
                $b = Join-Path $data ("backups\" + $m.Name + "\" + $rel)
                if (-not (Test-Path -LiteralPath $b)) { continue }
                $earlier = $null
                $before = @($ix[$rel.ToLower()] | Where-Object { $_ -lt $i })
                if ($before.Count -gt 0) { $earlier = $mods[[int]($before | Measure-Object -Maximum).Maximum] }
                if ($earlier) {
                    $ef = Get-LibFile $earlier.Name $rel
                    if (-not (Test-Path -LiteralPath $ef)) { New-ParentDir $ef; Copy-Item -LiteralPath $b -Destination $ef -Force }
                } else {
                    $rp = Get-ReplacedFile $rel
                    if (-not (Test-Path -LiteralPath $rp)) { New-ParentDir $rp; Copy-Item -LiteralPath $b -Destination $rp -Force }
                }
            }
        }
        $m | Add-Member -NotePropertyName Library -NotePropertyValue $true -Force
        $m | Add-Member -NotePropertyName Backups -NotePropertyValue @() -Force
    }
    Save-Db $mods
    Save-Deployed $dep
    foreach ($m in $old) {
        foreach ($sub in @("disabled", "backups")) {
            $d = Join-Path $data ($sub + "\" + $m.Name)
            if (Test-Path -LiteralPath $d) { Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction SilentlyContinue }
        }
    }
    foreach ($sub in @("disabled", "backups")) {
        $d = Join-Path $data $sub
        if ((Test-Path -LiteralPath $d) -and @(Get-ChildItem -LiteralPath $d -Recurse -File -Force -ErrorAction SilentlyContinue).Count -eq 0) { Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction SilentlyContinue }
    }
    Sync-Files (Get-AllModFiles $mods) $mods
    Set-Status "Your mods are stored the new way now - turning them on/off is safe in any order." $C_GREEN
}
# mods installed before: their packed models were all called models.img - give each its own name (once)
function Rename-OldImgs {
    $mods = @(Load-Db); $dep = Load-Deployed; $changed = @()
    foreach ($m in $mods) {
        if (-not (Test-InLibrary $m)) { continue }
        $old = "update\" + $m.Name + "\models.img"
        if (@($m.Files | ForEach-Object { [string]$_ }) -inotcontains $old) { continue }
        $new = "update\" + $m.Name + "\" + (Get-ImgName ([string]$m.Name))
        if ($new -ieq $old) { continue }
        $lo = Get-LibFile $m.Name $old; $ln = Get-LibFile $m.Name $new
        if ([IO.File]::Exists($lo) -and -not [IO.File]::Exists($ln)) { Move-Item -LiteralPath $lo -Destination $ln -Force }
        $m.Files = @($m.Files | ForEach-Object { if ([string]$_ -ieq $old) { $new } else { $_ } })
        $g = Join-Path $script:Game $old
        if ($dep.ContainsKey($old.ToLower())) { $dep.Remove($old.ToLower()); if ([IO.File]::Exists($g)) { Remove-Item -LiteralPath $g -Force -ErrorAction SilentlyContinue } }
        $changed += $new
    }
    if ($changed.Count -gt 0) { Save-Db $mods; Save-Deployed $dep; Sync-Files $changed $mods }
}
# one time: data files (.ide, .dat...) that were put in a mod's own update folder move to their real path in update\
function Move-DataFiles {
    $mods = @(Load-Db); $dep = Load-Deployed; $changed = @()
    $owned = @{}; foreach ($m in $mods) { foreach ($f in @($m.Files)) { if ($f) { $owned[([string]$f).ToLower()] = $true } } }
    foreach ($m in $mods) {
        if (-not (Test-InLibrary $m)) { continue }
        $moved = $false
        $files = @($m.Files | ForEach-Object { [string]$_ })
        for ($i = 0; $i -lt $files.Count; $i++) {
            $old = $files[$i]
            $segs = $old.Split("\")
            if ($segs.Length -lt 4 -or $segs[0] -ine "update" -or $ROOTS -contains $segs[1].ToLower() -or $segs[1] -match '(?i)^LC Installer') { continue }
            $gp = Get-GamePath $old
            if (-not (Test-DataPath $gp)) { continue }
            $new = "update\" + ($segs[2..($segs.Length - 1)] -join "\")
            $lo = Get-LibFile $m.Name $old; $ln = Get-LibFile $m.Name $new
            if (-not [IO.File]::Exists($lo)) { continue }
            if (-not [IO.File]::Exists($ln)) { New-ParentDir $ln; Move-Item -LiteralPath $lo -Destination $ln -Force }
            $g = Join-Path $script:Game $old
            if ($dep.ContainsKey($old.ToLower())) { $dep.Remove($old.ToLower()); if ([IO.File]::Exists($g)) { Remove-Item -LiteralPath $g -Force -ErrorAction SilentlyContinue; Remove-EmptyDirs (Split-Path $g -Parent) } }
            # a loose copy already sitting there (same file, put by hand) is simply taken over
            $gn = Join-Path $script:Game $new
            if (-not $owned.ContainsKey($new.ToLower()) -and [IO.File]::Exists($gn) -and (Test-SameFile $gn $ln)) { Remove-Item -LiteralPath $gn -Force -ErrorAction SilentlyContinue }
            $files[$i] = $new; $owned[$new.ToLower()] = $true; $moved = $true
            $changed += $new
        }
        if ($moved) { $m.Files = $files }
    }
    if ($changed.Count -gt 0) { Save-Db $mods; Save-Deployed $dep; Sync-Files $changed $mods }
    Rebuild-Merges $mods
    try { Update-TrainerLists $mods } catch { }
}
# car/ped data files that older versions placed whole in update\common\data: now they're combined with the game's own
function Move-KeyedData {
    $mods = @(Load-Db); $changed = @()
    foreach ($m in $mods) {
        if (-not (Test-InLibrary $m)) { continue }
        $moved = $false
        $files = @($m.Files | ForEach-Object { [string]$_ })
        for ($i = 0; $i -lt $files.Count; $i++) {
            $old = $files[$i]
            if ($old -notmatch '(?i)^update\\common\\data\\[^\\]+$') { continue }
            $gp = Get-GamePath $old
            if (-not $KEYED.Contains($gp)) { continue }
            $new = "update\" + [string]$m.Name + "\" + $gp
            $lo = Get-LibFile $m.Name $old; $ln = Get-LibFile $m.Name $new
            if (-not [IO.File]::Exists($lo)) { continue }
            if (-not [IO.File]::Exists($ln)) { New-ParentDir $ln; Move-Item -LiteralPath $lo -Destination $ln -Force }
            $files[$i] = $new; $moved = $true
            $changed += @($old, $new)
        }
        if ($moved) { $m.Files = $files }
    }
    if ($changed.Count -gt 0) { Save-Db $mods; Sync-Files $changed $mods; Rebuild-Merges $mods; try { Update-TrainerLists $mods } catch { } }
}
# brings a mod's files (already in the game folder) into the library - used for mods found in the game folder
function Import-ToLibrary($m) {
    $dep = Load-Deployed
    foreach ($rel in @($m.Files | Where-Object { $_ } | ForEach-Object { [string]$_ })) {
        $p = Join-Path $script:Game $rel
        if (Test-Path -LiteralPath $p) { Place-File $p (Get-LibFile $m.Name $rel); $dep[$rel.ToLower()] = [string]$m.Name }
    }
    Save-Deployed $dep
    $m | Add-Member -NotePropertyName Library -NotePropertyValue $true -Force
}

# ----------------------------------------------------------------------------
#  Unpacking
# ----------------------------------------------------------------------------
function Find-7z {
    foreach ($p in @("$env:ProgramFiles\7-Zip\7z.exe", "${env:ProgramFiles(x86)}\7-Zip\7z.exe")) { if (Test-Path $p) { return $p } }
    return $null
}
function Find-UnRar {
    foreach ($p in @("$env:ProgramFiles\WinRAR\UnRAR.exe", "${env:ProgramFiles(x86)}\WinRAR\UnRAR.exe")) { if (Test-Path $p) { return $p } }
    return $null
}

function Expand-Mod($path) {
    # unpack inside the installer's own folder (avoids short 8.3 temp paths)
    $tmp = Join-Path (Get-DataDir) ("temp\" + [guid]::NewGuid().ToString("N").Substring(0, 8))
    New-Item -ItemType Directory $tmp -Force | Out-Null
    $ext = [IO.Path]::GetExtension($path).ToLower()
    if ((Get-Item $path).PSIsContainer) {
        Copy-Item -Path (Join-Path $path "*") -Destination $tmp -Recurse -Force
    } elseif ($ext -eq ".zip" -or $ext -eq ".oiv") {
        [System.IO.Compression.ZipFile]::ExtractToDirectory($path, $tmp)
    } else {
        $z = Find-7z
        if ($z) { & $z x -y ("-o" + $tmp) $path | Out-Null }
        elseif ($ext -eq ".rar" -and (Find-UnRar)) { & (Find-UnRar) x -y $path ($tmp + "\") | Out-Null }
        else { throw "Can't open $ext files. Install 7-Zip (free) or extract the mod first and choose the folder." }
    }
    # unpack any OpenIV packages found inside
    foreach ($o in Get-ChildItem $tmp -Recurse -Filter *.oiv -ErrorAction SilentlyContinue) {
        $d = Join-Path $o.DirectoryName ($o.BaseName + "__oiv")
        [System.IO.Compression.ZipFile]::ExtractToDirectory($o.FullName, $d)
        Remove-Item $o.FullName -Force
    }
    return $tmp
}

# ----------------------------------------------------------------------------
#  Working out where every file goes
# ----------------------------------------------------------------------------
function Is-Picture($file) { return ($file.Name -match '\.(jpg|jpeg|png|bmp|gif|webp)$') }
function New-DocRow($f) {
    if (Is-Picture $f) { return [pscustomobject]@{ Source = $f.FullName; Dest = ""; Kind = "PREVIEW"; Note = "Just a preview picture - the game doesn't use it. Double-click to see it." } }
    return [pscustomobject]@{ Source = $f.FullName; Dest = ""; Kind = "SKIP"; Note = "Readme or notes - not needed by the game" }
}
function Is-Doc($file) {
    $n = $file.Name.ToLower()
    if ($DOC_EXT -contains $file.Extension.ToLower()) { return $true }
    if ($n -match "^(readme|read me|leeme|lisezmoi|install|instructions|changelog|license|credits)") { return $true }
    if ($n -match "^(screen|preview|thumb)" -and $n -match "\.(jpg|jpeg|png|bmp|gif)$") { return $true }
    # pictures: GTA IV never loads these, so they're previews - except inside graphics mods (ENB/ReShade use them)
    if ($n -match "\.(jpg|jpeg|png|bmp|gif|webp)$") {
        if ($gfxDirs -and $gfxDirs.Count -gt 0) {
            foreach ($gd in @($gfxDirs.Keys)) { if ($file.FullName.StartsWith([string]$gd + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { return $false } }
            if ($file.FullName -match '\\(reshade[^\\]*|enbseries|enb[^\\]*)\\') { return $false }
        }
        return $true
    }
    # text files are notes, except the game's own command line file
    if ($n -match "\.(txt|nfo|md|doc|docx)$" -and $n -ne "commandline.txt") { return $true }
    if ($n -eq "thumbs.db" -or $n -match '^\.git' -or $n -eq ".editorconfig") { return $true }
    return $false
}

function Clean-Name($s) { return ($s -replace "[^A-Za-z0-9 _\-\.]", "" -replace "\s+", " ").Trim() }

# ----------------------------------------------------------------------------
#  Game version, Fusion Fix and packing loose models into an .img
# ----------------------------------------------------------------------------
function Get-GameVersion {
    try {
        $vi = (Get-Item (Join-Path $script:Game "GTAIV.exe")).VersionInfo
        return New-Object Version($vi.FileMajorPart, $vi.FileMinorPart, $vi.FileBuildPart, $vi.FilePrivatePart)
    } catch { return $null }
}
function Test-CompleteEdition { $v = Get-GameVersion; return ($v -and $v -ge [version]"1.2.0.0") }

function Get-FFIniPath { return Join-Path $script:Game "plugins\GTAIV.EFLC.FusionFix.ini" }
function Get-FFIniValue($key) {
    $p = Get-FFIniPath
    if (-not (Test-Path $p)) { return $null }
    foreach ($line in Get-Content $p) { if ($line -match ("^\s*" + [regex]::Escape($key) + "\s*=\s*([^\s/;]*)")) { return $Matches[1] } }
    return $null
}
function Set-FFIniValue($key, $value) {
    $p = Get-FFIniPath
    if (-not (Test-Path $p)) { return $false }
    $lines = @(Get-Content $p)
    $done = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match ("^(\s*" + [regex]::Escape($key) + "\s*=\s*)([^\s/;]*)(.*)$")) {
            $lines[$i] = $Matches[1] + $value + $Matches[3]; $done = $true; break
        }
    }
    if ($done) { Set-Content -Path $p -Value $lines -Encoding ASCII }
    return $done
}

# builds a GTA IV .img (version 3) that Fusion Fix loads from the update folder
# fixes .img files made by older versions of this app (their models were missing the resource marker)
function Repair-ImgFile($path) {
    $fixed = 0
    $fs = [IO.File]::Open($path, "Open", "ReadWrite", "Read")
    try {
        $br = New-Object IO.BinaryReader($fs)
        if ($fs.Length -lt 20 -or $br.ReadUInt32() -ne [uint32]2840472146 -or $br.ReadUInt32() -ne 3) { return 0 }
        $count = $br.ReadUInt32(); [void]$br.ReadUInt32(); [void]$br.ReadUInt32()
        for ($i = 0; $i -lt $count; $i++) {
            $at = 20 + $i * 16
            $fs.Position = $at + 8; $block = $br.ReadUInt32(); [void]$br.ReadUInt16(); $flags = $br.ReadUInt16()
            if ($flags -band 0x2000) { continue }
            $fs.Position = [int64]$block * 2048
            $magic = $br.ReadBytes(4)
            if ($magic.Length -eq 4 -and $magic[0] -eq 0x52 -and $magic[1] -eq 0x53 -and $magic[2] -eq 0x43 -and ($magic[3] -eq 5 -or $magic[3] -eq 0x85)) {
                $fs.Position = $at + 14
                $bytes = [BitConverter]::GetBytes([uint16]($flags -bor 0x2000))
                $fs.Write($bytes, 0, 2)
                $fixed++
            }
        }
    } finally { $fs.Close() }
    return $fixed
}
function Repair-ImgArchives {
    if (-not $script:Game) { return }
    $total = 0
    foreach ($m in @(Load-Db)) {
        foreach ($rel in @($m.Files)) {
            if (-not $rel -or $rel -notmatch '\.img$') { continue }
            foreach ($p in @((Join-Path $script:Game $rel), (Join-Path (Get-DataDir) ("disabled\" + $m.Name + "\" + $rel)), (Get-LibFile $m.Name $rel))) {
                if (Test-Path -LiteralPath $p) { try { $total += Repair-ImgFile $p } catch { } }
            }
        }
    }
    if ($total -gt 0) { $script:ImgRepaired = $total }
}

function New-ImgArchive($sources, $outPath) {
    $entries = @()
    foreach ($src in $sources) {
        $bytes = [IO.File]::ReadAllBytes($src)
        $type = [uint32]1; $flags = [uint32]$bytes.Length; $isRes = $false
        if ($bytes.Length -ge 12 -and $bytes[0] -eq 0x52 -and $bytes[1] -eq 0x53 -and $bytes[2] -eq 0x43 -and ($bytes[3] -eq 5 -or $bytes[3] -eq 0x85)) {
            $type = [BitConverter]::ToUInt32($bytes, 4); $flags = [BitConverter]::ToUInt32($bytes, 8); $isRes = $true   # resource: type and flags from its header
        }
        $entries += [pscustomobject]@{ Name = [IO.Path]::GetFileName($src); Bytes = $bytes; Type = $type; Flags = $flags; IsRes = $isRes }
    }
    $names = [Text.Encoding]::ASCII.GetBytes((($entries | ForEach-Object { $_.Name }) -join "`0") + "`0")
    $tableSize = $entries.Count * 16 + $names.Length
    $dataStart = [int][math]::Ceiling((20 + $tableSize) / 2048)
    $fs = [IO.File]::Create($outPath)
    $bw = New-Object IO.BinaryWriter($fs)
    try {
        $bw.Write([uint32]2840472146)          # 0xA94E2A52, unencrypted IMG
        $bw.Write([uint32]3); $bw.Write([uint32]$entries.Count); $bw.Write([uint32]$tableSize)
        $bw.Write([uint16]16); $bw.Write([uint16]0xE9)
        $block = $dataStart
        foreach ($e in $entries) {
            $used = [int][math]::Ceiling($e.Bytes.Length / 2048)
            $bw.Write([uint32]$e.Flags); $bw.Write([uint32]$e.Type); $bw.Write([uint32]$block)
            # last field: padding in the low 11 bits, 0x2000 marks models/textures as resources (the game needs it)
            $bw.Write([uint16]$used); $bw.Write([uint16](($used * 2048 - $e.Bytes.Length) -bor $(if ($e.IsRes) { 0x2000 } else { 0 })))
            $block += $used
        }
        $bw.Write($names)
        $gap = $dataStart * 2048 - $fs.Position
        if ($gap -gt 0) { $bw.Write((New-Object byte[] $gap)) }
        foreach ($e in $entries) {
            $bw.Write($e.Bytes)
            $pad = ([int][math]::Ceiling($e.Bytes.Length / 2048)) * 2048 - $e.Bytes.Length
            if ($pad -gt 0) { $bw.Write((New-Object byte[] $pad)) }
        }
    } finally { $bw.Close(); $fs.Close() }
}

function New-Row($src, $dest, $kind, $note) { return [pscustomobject]@{ Source = $src; Dest = $dest; Kind = $kind; Note = $note } }

# ----------------------------------------------------------------------------
#  Where does this file go? Clues, strongest first:
#   remembered choice > same file already there > the mod's readme > your scripts/plugins
#   mention it > files named the same way > settings that look alike
# ----------------------------------------------------------------------------
function Get-LearnedPath { return (Join-Path (Get-DataDir) "learned.json") }
function Load-Learned {
    if ($script:Learned) { return $script:Learned }
    $h = @{}
    $p = Get-LearnedPath
    if (Test-Path $p) { try { $j = Get-Content $p -Raw | ConvertFrom-Json; foreach ($pr in $j.PSObject.Properties) { $h[$pr.Name] = [string]$pr.Value } } catch { } }
    $script:Learned = $h
    return $h
}
function Get-NamePattern($name) {
    $ext = [IO.Path]::GetExtension($name)
    $stem = [IO.Path]::GetFileNameWithoutExtension($name)
    $cut = $stem.IndexOfAny([char[]]"_-. ")
    if ($cut -lt 2 -or -not $ext) { return $null }
    return ($stem.Substring(0, $cut + 1) + "*" + $ext).ToLower()
}
function Save-Learned($name, $folder) {
    $h = Load-Learned
    $h[$name.ToLower()] = $folder
    $pat = Get-NamePattern $name
    if ($pat) { $h[$pat] = $folder }
    try { [pscustomobject]$h | ConvertTo-Json | Set-Content (Get-LearnedPath) -Encoding UTF8 } catch { }
}

# paths written in the mod's readme ("copy to scripts\SpiderMan\Suits")
function Get-ReadmeHints($files) {
    $hints = New-Object System.Collections.ArrayList
    foreach ($f in @($files)) {
        if ($f.Length -gt 1MB) { continue }
        if ($f.Extension -notmatch '^\.(txt|md|nfo|rtf)$' -and $f.Name -notmatch '(?i)^(read ?me|install|instructions)') { continue }
        $lines = @(Get-Content -LiteralPath $f.FullName -ErrorAction SilentlyContinue)
        foreach ($line in $lines) {
            foreach ($m in [regex]::Matches([string]$line, '(?i)(?<![\w])((?:scripts|plugins|update|common|pc|tlad|tbogt)(?:[\\/][^\\/:*?"<>|\r\n]+)+|(?:scripts|plugins)(?=[\\/\s.,)]|$))')) {
                $segs = @($m.Groups[1].Value -split '[\\/]' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
                # keep folder names; stop at sentence words ("Suits and then run")
                $keep = @()
                foreach ($sg in $segs) {
                    $parts = @($sg -split '(?i)\s+(?:and|then|folder|directory|to|in|from|or|if|with)\b', 2)
                    $clean = $parts[0].Trim().TrimEnd('.', ',', ';', ':', ')', '"', "'")
                    if ($clean) { $keep += $clean }
                    if ($parts.Count -gt 1 -or -not $clean) { break }
                }
                if ($keep.Count -gt 0) { [void]$hints.Add([pscustomobject]@{ Path = ($keep -join "\"); Line = [string]$line }) }
            }
        }
    }
    return $hints
}

# your installed scripts and plugins, read once per mod you load (they often name their files and folders)
function Get-BinaryIndex {
    if ($script:BinIndex) { return $script:BinIndex }
    $list = New-Object System.Collections.ArrayList
    $cand = @()
    foreach ($top in @("scripts", "plugins")) { $d = Join-Path $script:Game $top; if (Test-Path $d) { $cand += @(Get-ChildItem -LiteralPath $d -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -match '^\.(dll|asi|cs|vb)$' }) } }
    $cand += @(Get-ChildItem -LiteralPath $script:Game -File -Filter *.asi -ErrorAction SilentlyContinue)
    $total = 0
    foreach ($f in ($cand | Select-Object -First 250)) {
        if ($f.Length -gt 16MB -or $f.Name -match '(?i)fusionfix') { continue }
        $total += $f.Length; if ($total -gt 200MB) { break }
        try {
            $b = [IO.File]::ReadAllBytes($f.FullName)
            [void]$list.Add([pscustomobject]@{ Rel = $f.FullName.Substring($script:Game.Length).TrimStart("\"); A = [Text.Encoding]::GetEncoding(28591).GetString($b); U = [Text.Encoding]::Unicode.GetString($b) })
        } catch { }
    }
    $script:BinIndex = $list
    return $list
}
function Get-PathBefore([string]$text, [int]$idx) {
    $start = [math]::Max(0, $idx - 160)
    $chunk = $text.Substring($start, $idx - $start)
    $cut = $chunk.LastIndexOfAny([char[]]@([char]0, [char]'"', [char]10, [char]13, [char]'|', [char]'*', [char]'<', [char]'>'))
    $p = $chunk.Substring($cut + 1) -replace '/', '\'
    $p = $p -replace '\\\\', '\'
    $p = $p.TrimStart('.', '\')
    if ($p -match '[^\x20-\x7e]') { return "" }
    return $p.TrimEnd('\')
}
function Find-InBinaries($name) {
    $idx = Get-BinaryIndex
    if ($idx.Count -eq 0) { return $null }
    $terms = @($name)
    $pat = Get-NamePattern $name
    if ($pat) { $terms += $pat.Substring(0, $pat.IndexOf("*")) }
    foreach ($t in $terms) {
        if ($t.Length -lt 4) { continue }
        foreach ($bin in $idx) {
            foreach ($txt in @($bin.A, $bin.U)) {
                $at = $txt.IndexOf($t, [StringComparison]::OrdinalIgnoreCase)
                if ($at -lt 0) { continue }
                $before = Get-PathBefore $txt $at
                $binDir = Split-Path $bin.Rel -Parent
                $folder = $null
                if ($before) {
                    if ($before -match '(?i)^(scripts|plugins|update)(\\|$)') { $folder = $before }
                    elseif ($binDir -and (Test-Path -LiteralPath (Join-Path $script:Game (Join-Path $binDir $before)))) { $folder = Join-Path $binDir $before }
                    elseif (Test-Path -LiteralPath (Join-Path $script:Game $before)) { $folder = $before }
                }
                if ($folder) { return [pscustomobject]@{ Folder = $folder; Score = 80; Why = (Split-Path $bin.Rel -Leaf) + " looks for it in " + $folder } }
                if ($t -eq $name -and $binDir) { return [pscustomobject]@{ Folder = $binDir; Score = 45; Why = (Split-Path $bin.Rel -Leaf) + " uses this file - put next to it" } }
            }
        }
    }
    return $null
}
function Get-IniKeys($path) {
    $k = @{}
    foreach ($l in @(Get-Content -LiteralPath $path -TotalCount 400 -ErrorAction SilentlyContinue)) {
        $t = ([string]$l).Trim()
        if ($t -match '^\[(.+)\]$') { $k["[" + $Matches[1].ToLower() + "]"] = 1 }
        elseif ($t -match '^([^=;#]+)=') { $k[$Matches[1].Trim().ToLower()] = 1 }
    }
    return $k
}
function Find-LookAlikeIni($path) {
    $mine = Get-IniKeys $path
    if ($mine.Count -lt 2) { return $null }
    $best = $null; $bestScore = 0.0
    foreach ($r in (Get-GameFileIndex)) {
        if ($r -notmatch '(?i)\.ini$') { continue }
        $other = Get-IniKeys (Join-Path $script:Game $r)
        if ($other.Count -lt 2) { continue }
        $same = @($mine.Keys | Where-Object { $other.ContainsKey($_) }).Count
        $all = @(@($mine.Keys) + @($other.Keys) | Select-Object -Unique).Count
        $j = $same / [math]::Max(1, $all)
        if ($j -gt $bestScore) { $bestScore = $j; $best = $r }
    }
    if ($best -and $bestScore -ge 0.5) {
        $fd = Split-Path $best -Parent
        return [pscustomobject]@{ Folder = $fd; Score = 50; Why = "Its settings match " + (Split-Path $best -Leaf) + " in " + $(if ($fd) { $fd } else { "the game folder" }) }
    }
    return $null
}

function Find-Place($file) {
    if (-not $script:Game) { return $null }
    $name = $file.Name
    $found = New-Object System.Collections.ArrayList
    # 1. you told the app before
    $learned = Load-Learned
    $pat = Get-NamePattern $name
    if ($learned.ContainsKey($name.ToLower())) { [void]$found.Add([pscustomobject]@{ Folder = $learned[$name.ToLower()]; Score = 98; Why = "You put this file here last time" }) }
    elseif ($pat -and $learned.ContainsKey($pat)) { [void]$found.Add([pscustomobject]@{ Folder = $learned[$pat]; Score = 95; Why = "You put $pat files here last time" }) }
    # 1b. settings for a script or plugin you have (MyMod.ini next to MyMod.asi / MyMod.net.dll)
    $stem = Get-Stem $name
    if ($name -match '(?i)\.(ini|cfg|xml|json|txt)$') {
        foreach ($r in (Get-GameFileIndex)) {
            $leaf = Split-Path $r -Leaf
            if ($leaf -match '(?i)\.(asi|dll|cs|vb)$' -and (Get-Stem $leaf) -ieq $stem) {
                $fd = Split-Path $r -Parent
                [void]$found.Add([pscustomobject]@{ Folder = $fd; Score = 85; Why = "Settings for $leaf - goes next to it" }); break
            }
        }
    }
    # 2. the same file is already in your game
    $like = Find-SimilarPlace $name
    if ($like -and $like.Why -like "Replaces*") { [void]$found.Add([pscustomobject]@{ Folder = $like.Folder; Score = 100; Why = $like.Why }) }
    # 3. the mod's readme
    foreach ($h in @($script:PlanHints)) {
        if ($h.Path -match ('(?i)(^|\\)' + [regex]::Escape($name) + '$')) { [void]$found.Add([pscustomobject]@{ Folder = (Split-Path $h.Path -Parent); Score = 90; Why = "The readme says: " + $h.Path }); break }
        $pre = $(if ($pat) { $pat.Substring(0, $pat.IndexOf("*")) } else { "~~none~~" })
        if (($h.Line.IndexOf($name, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or $h.Line.IndexOf($pre, [StringComparison]::OrdinalIgnoreCase) -ge 0) -and $h.Path -notmatch '\.[a-z0-9]{2,4}$') {
            [void]$found.Add([pscustomobject]@{ Folder = $h.Path; Score = 70; Why = "The readme says to put it in " + $h.Path }); break
        }
    }
    # 4. files named the same way
    if ($like -and $like.Why -notlike "Replaces*") { [void]$found.Add([pscustomobject]@{ Folder = $like.Folder; Score = 60; Why = $like.Why }) }
    # 5. your scripts/plugins mention it  6. settings that look alike
    if (@($found | Where-Object { $_.Score -ge 80 }).Count -eq 0) {
        $bin = Find-InBinaries $name
        if ($bin) { [void]$found.Add($bin) }
        if ($file.Extension -ieq ".ini") { $ini = Find-LookAlikeIni $file.FullName; if ($ini) { [void]$found.Add($ini) } }
    }
    if ($found.Count -eq 0) { return $null }
    return @($found | Sort-Object Score -Descending)[0]
}

# files already in the game folder that were put there by mods (scripts, plugins, mod folders) - not the game's own data
function Get-GameFileIndex {
    if ($script:GameFileIndex) { return $script:GameFileIndex }
    $skip = @("update", "lcmodinstaller", "pc", "common", "tlad", "tbogt", "audio", "movies", "tbogt_dlc", "tlad_dlc")
    $list = New-Object System.Collections.ArrayList
    foreach ($f in @(Get-ChildItem -LiteralPath $script:Game -File -ErrorAction SilentlyContinue)) { [void]$list.Add($f.Name) }
    foreach ($d in @(Get-ChildItem -LiteralPath $script:Game -Directory -ErrorAction SilentlyContinue)) {
        if ($skip -contains $d.Name.ToLower()) { continue }
        foreach ($f in @(Get-ChildItem -LiteralPath $d.FullName -Recurse -File -ErrorAction SilentlyContinue)) { [void]$list.Add($f.FullName.Substring($script:Game.Length).TrimStart("\")) }
    }
    $script:GameFileIndex = $list
    return $list
}
# where a file probably goes: where the same file already is, or where files named the same way are (Suit_*.ini)
function Find-SimilarPlace($name) {
    if (-not $script:Game) { return $null }
    $idx = Get-GameFileIndex
    $same = @($idx | Where-Object { (Split-Path $_ -Leaf) -ieq $name })
    if ($same.Count -gt 0) {
        $folder = Split-Path $same[0] -Parent
        return [pscustomobject]@{ Folder = $folder; Why = "Replaces the one you have in " + $(if ($folder) { $folder } else { "the game folder" }) + " (backed up)" }
    }
    $ext = [IO.Path]::GetExtension($name)
    $stem = [IO.Path]::GetFileNameWithoutExtension($name)
    $cut = $stem.IndexOfAny([char[]]"_-. ")
    if ($cut -lt 2 -or -not $ext) { return $null }
    $prefix = $stem.Substring(0, $cut + 1)
    $counts = @{}
    foreach ($r in $idx) {
        $leaf = Split-Path $r -Leaf
        if ($leaf.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -and $leaf.EndsWith($ext, [StringComparison]::OrdinalIgnoreCase)) {
            $fd = Split-Path $r -Parent
            $counts[$fd] = 1 + $(if ($counts.ContainsKey($fd)) { $counts[$fd] } else { 0 })
        }
    }
    if ($counts.Count -eq 0) { return $null }
    $best = @($counts.GetEnumerator() | Sort-Object Value -Descending)[0]
    $where = $(if ($best.Key) { $best.Key } else { "the game folder" })
    return [pscustomobject]@{ Folder = $best.Key; Why = "Goes next to your other $prefix*$ext files in $where" }
}

# where an archive (like playerped.rpf) lives in the game folder
function Find-ArchivePath($prefix, $name) {
    $segs = @(([string]$prefix).Split("\") | Where-Object { $_ })
    for ($i = 0; $i -lt $segs.Count; $i++) {
        if (@("pc", "common", "tlad", "tbogt") -contains $segs[$i].ToLower()) {
            $cand = (@($segs[$i..($segs.Count - 1)]) + $name) -join "\"
            if (Test-Path -LiteralPath (Join-Path $script:Game $cand)) { return $cand }
            break
        }
    }
    if (-not $script:RpfIndex) {
        $script:RpfIndex = @(Get-ChildItem -LiteralPath $script:Game -Recurse -Filter *.rpf -File -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -notmatch '\\(update|LCModInstaller)\\' } |
            ForEach-Object { $_.FullName.Substring($script:Game.Length).TrimStart("\") })
    }
    $hits = @($script:RpfIndex | Where-Object { (Split-Path $_ -Leaf) -ieq $name } |
        Sort-Object @{ Expression = { if ($_ -match '^(tlad|tbogt)\\') { 1 } else { 0 } } }, @{ Expression = { $_.Length } })
    if ($hits.Count -gt 0) { return $hits[0] }
    return $null
}

# ---- what's inside every game archive (.img and .rpf), so any mod file finds its home ----
# kept in LCModInstaller\archive-index.json; only archives that changed are read again
function Get-GameArchives {
    return @(Get-ChildItem -LiteralPath $script:Game -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -match '^(?i)\.(img|rpf)$' } |
        ForEach-Object { $_.FullName.Substring($script:Game.Length).TrimStart("\", "/") } |
        Where-Object { $_ -notmatch '(?i)^(update|LCModInstaller|rtx-remix|backup[^\\/]*)[\\/]' })
}
# one archive's contents: @(@{ Inner = "path/inside"; Size = n; Rsc = $true }, ...)
function Read-ArchiveList([string]$rel, $key) {
    $p = Join-Path $script:Game $rel
    $lines = $(if ($rel -match '(?i)\.img$') { [LCMI.Img]::List($p, $key) } else { [LCMI.Rpf]::List($p, $key) })
    $out = @()
    foreach ($l in @($lines)) {
        if (-not ([string]$l).StartsWith("F ")) { continue }
        $t = ([string]$l).Substring(2).Split(" ")
        $rsc = $t[-1] -like "rsc*"
        $sz = $(if ($rsc) { $t[-2] } else { $t[-1] })
        $nameParts = $(if ($rsc) { $t[0..($t.Count - 3)] } else { $t[0..($t.Count - 2)] })
        $out += [pscustomobject]@{ Inner = ($nameParts -join " "); Size = [long]$sz; Rsc = $rsc }
    }
    return $out
}
function Get-ArchiveIndex([bool]$quiet = $false) {
    if ($script:ArcIndex) { return $script:ArcIndex }
    $byName = @{}
    $script:ArcIndex = $byName
    if (-not $script:Game -or -not $script:UI) { return $byName }
    $key = $null; try { $key = Get-ArchiveKey } catch { }
    $cachePath = Join-Path (Get-DataDir) "archive-index.json"
    $cache = @{}
    if (Test-Path -LiteralPath $cachePath) {
        try { $o = Get-Content -LiteralPath $cachePath -Raw | ConvertFrom-Json; foreach ($pr in @($o.PSObject.Properties)) { $cache[$pr.Name] = $pr.Value } } catch { }
    }
    $fresh = @{}; $changed = $false; $n = 0
    $all = @(Get-GameArchives)
    foreach ($rel in $all) {
        $n++
        $fi = Get-Item -LiteralPath (Join-Path $script:Game $rel) -Force
        $sig = "" + $fi.Length + "|" + $fi.LastWriteTimeUtc.Ticks
        $c = $cache[$rel]
        if ($c -and [string]$c.Sig -eq $sig) { $files = @($c.Files) }
        else {
            if (-not $quiet) { Set-Status "Reading what's inside your game archives ($n of $($all.Count), first time only)..." $C_DIM $false; try { [void]$form.Refresh() } catch { } }
            $files = @()
            try { $files = @(Read-ArchiveList $rel $key | ForEach-Object { $_.Inner }) } catch { }   # audio archives and odd files can't be read - skipped
            $changed = $true
        }
        $fresh[$rel] = [pscustomobject]@{ Sig = $sig; Files = @($files) }
        foreach ($inner in $files) {
            $leaf = ([string]$inner).Split("/")[-1].ToLower()
            if (-not $byName.ContainsKey($leaf)) { $byName[$leaf] = New-Object System.Collections.ArrayList }
            [void]$byName[$leaf].Add([pscustomobject]@{ Archive = $rel; Inner = [string]$inner })
        }
    }
    if ($changed -or $fresh.Count -ne $cache.Count) {
        try { ([pscustomobject]$fresh) | ConvertTo-Json -Depth 4 -Compress | Set-Content -LiteralPath $cachePath -Encoding UTF8 } catch { }
    }
    return $byName
}
# the game archive a file name lives in (main game first, then the episodes)
function Find-InArchives([string]$name) {
    [void](Get-ArchiveIndex); $ix = $script:ArcIndex
    $k = $name.ToLower()
    if (-not $ix.ContainsKey($k)) { return $null }
    $hits = @($ix[$k] | Sort-Object @{ Expression = { if ($_.Archive -match '(?i)^(tlad|tbogt)[\\/]') { 1 } else { 0 } } }, @{ Expression = { if ($_.Archive -match '(?i)\.img$') { 0 } else { 1 } } }, @{ Expression = { $_.Archive.Length } })
    return $hits[0]
}
# a row for a mod file that replaces one inside a game archive
# the .img a mod's loose models are packed into - named after the mod, so two mods never have the same file
function Get-ImgName([string]$mod) { $n = ($mod -replace '[^A-Za-z0-9]', '').ToLower(); if ($n.Length -gt 40) { $n = $n.Substring(0, 40) }; if (-not $n) { $n = "models" }; return ($n + ".img") }
function New-ArchiveRow($src, $hit, $mod) {
    $leaf = Split-Path $hit.Archive -Leaf
    if ($hit.Archive -match '(?i)\.img$') { return (New-Row $src ("update\$mod\" + (Get-ImgName $mod)) "IMG" ("Replaces " + (Split-Path $src -Leaf) + " from " + $leaf + " - packed into an archive Fusion Fix loads")) }
    return [pscustomobject]@{ Source = $src; Dest = ($hit.Archive + "|" + $hit.Inner); Kind = "ARCHIVE"; Note = "Replaces " + $hit.Inner + " inside " + $leaf + " - packed automatically" }
}

# modded copies of game archives live here (Fusion Fix loads them instead of the originals)
$ARCHIVE_DIR = "update\LC Installer Archives"

# the archive key comes from the player's own GTAIV.exe (only its position is remembered)
function Get-ArchiveKey {
    if ($script:ArcKey) { return ,$script:ArcKey }
    $hintFile = Join-Path (Get-DataDir) "keyoffset.txt"
    $hint = -1
    if (Test-Path $hintFile) { $t = 0; if ([int]::TryParse((Get-Content $hintFile -Raw).Trim(), [ref]$t)) { $hint = $t } }
    $k = $null
    try { $k = [LCMI.Rpf]::FindKey((Join-Path $script:Game "GTAIV.exe"), $hint) } catch { $k = $null }
    if (-not $k) { return $null }
    $script:ArcKey = $k
    if ([LCMI.Rpf]::LastKeyOffset -ne $hint) { try { Set-Content $hintFile ([LCMI.Rpf]::LastKeyOffset) } catch { } }
    return ,$k
}

function Get-ModArchives($m) {
    if ($m -and ($m.PSObject.Properties.Name -contains "Archives")) { return @($m.Archives | Where-Object { $_ }) }
    return @()
}

# before the first change to an archive: offer an extra copy of the untouched original
function Offer-ArchiveBackup($archives) {
    foreach ($a in @($archives | Select-Object -Unique)) {
        $bk = Join-Path (Get-DataDir) ("originals\" + $a)
        if (Test-Path $bk) { continue }
        $orig = Join-Path $script:Game $a
        if (-not (Test-Path $orig)) { continue }
        $mb = [math]::Round((Get-Item $orig).Length / 1MB)
        $leaf = Split-Path $a -Leaf
        $r = [System.Windows.Forms.MessageBox]::Show("This mod changes files inside $leaf.`n`nYour original $leaf is never edited - a modded copy is built in the update folder, and uninstalling removes it.`n`nSave an extra backup of the original $leaf anyway? (Recommended, $mb MB)", "Create a backup?", "YesNo", "Question")
        if ($r -eq "Yes") {
            $bd = Split-Path $bk -Parent
            if (-not (Test-Path $bd)) { New-Item -ItemType Directory $bd -Force | Out-Null }
            Set-Status "Backing up $leaf..." $C_DIM $false; $form.Refresh()
            Copy-Item -LiteralPath $orig -Destination $bk -Force
        }
    }
}

# builds one modded copy per archive from the original + every mod that's on (in install order)
function Rebuild-Archives {
    $outRoot = Join-Path $script:Game $ARCHIVE_DIR
    $byArc = [ordered]@{}
    foreach ($m in @(Load-Db)) {
        if (-not (Test-ModOn $m)) { continue }
        foreach ($it in (Get-ModArchives $m)) {
            $k = ([string]$it.Archive).ToLower()
            if (-not $byArc.Contains($k)) { $byArc[$k] = [pscustomobject]@{ Archive = [string]$it.Archive; Items = (New-Object System.Collections.ArrayList) } }
            [void]$byArc[$k].Items.Add($it)
        }
    }
    if (Test-Path $outRoot) {
        foreach ($old in @(Get-ChildItem $outRoot -Recurse -File -ErrorAction SilentlyContinue)) {
            $rel = $old.FullName.Substring($outRoot.Length).TrimStart("\").ToLower()
            if (-not $byArc.Contains($rel)) { Remove-Item $old.FullName -Force -ErrorAction SilentlyContinue; Remove-EmptyDirs $old.DirectoryName }
        }
    }
    if ($byArc.Count -eq 0) { Update-WholeCopies; return $true }
    if (-not $script:UI) { Set-Status "The archive tool couldn't start, so files for game archives weren't packed." $C_RED; return $false }
    $key = Get-ArchiveKey
    $ok = $true
    foreach ($k in @($byArc.Keys)) {
        $a = $byArc[$k]
        $leaf = Split-Path $a.Archive -Leaf
        $orig = Join-Path $script:Game $a.Archive
        # a mod that's on may ship its own whole copy of this archive (like a big clothes pack's playerped.rpf):
        # build on top of that one, so its changes are kept
        $base = Get-ArchiveBase ([string]$a.Archive)
        if ($base) { $orig = $base }
        $out = Join-Path $outRoot $a.Archive
        if (-not (Test-Path $orig)) { $ok = $false; Set-Status "Can't find $($a.Archive) in your game folder." $C_RED; continue }
        Set-Status "Packing $leaf... (a few seconds)" $C_DIM $false; $form.Refresh()
        $inner = [string[]]@($a.Items | ForEach-Object { [string]$_.Inner })
        $srcs = [string[]]@($a.Items | ForEach-Object { Join-Path (Get-DataDir) ([string]$_.Store) })
        try {
            $rep = [LCMI.Rpf]::Build($orig, $out, $key, $inner, $srcs)
            try { $mk = Get-BaseMarkPath ([string]$a.Archive); New-ParentDir $mk; [IO.File]::WriteAllText($mk, (Get-BaseMark ([string]$a.Archive))) } catch { }
            try { Add-Content (Join-Path (Get-DataDir) "archives.log") ((Get-Date).ToString("s") + "  " + $a.Archive + "`r`n" + $rep) } catch { }
        } catch {
            $ok = $false
            $e = $_.Exception; while ($e.InnerException) { $e = $e.InnerException }
            Set-Status ("Couldn't pack " + $leaf + ": " + $e.Message) $C_RED
        }
    }
    Update-WholeCopies
    return $ok
}
function Get-ArchiveBase([string]$arc) {
    $want = $arc.ToLower()
    $allMods = @(Load-Db)
    for ($mi = $allMods.Count - 1; $mi -ge 0; $mi--) {
        $om = $allMods[$mi]
        if (-not (Test-ModOn $om)) { continue }
        $whole = @($om.Files | Where-Object { $_ -and (Test-WholeArchiveCopy ([string]$_)) -and (Get-GamePath ([string]$_)) -eq $want } | Select-Object -First 1)
        if ($whole.Count -eq 0) { continue }
        $cand = $(if (Test-InLibrary $om) { Get-LibFile $om.Name ([string]$whole[0]) } else { Join-Path $script:Game ([string]$whole[0]) })
        if ([IO.File]::Exists($cand)) { return $cand }
    }
    return $null
}
# the modded copies remember what they were built on; built again at start if that changed (e.g. after an update of this app)
function Get-BaseMark([string]$arc) {
    $b = Get-ArchiveBase $arc
    if (-not $b) { $b = Join-Path $script:Game $arc }
    try { $fi = New-Object IO.FileInfo($b); return $b.ToLower() + "|" + $fi.Length } catch { return $b.ToLower() }
}
function Get-BaseMarkPath([string]$arc) { return Join-Path (Get-DataDir) ("archive-bases\" + $arc + ".txt") }
# does this mod change a game archive (files for inside it, or a whole copy of one)?
function Test-TouchesArchive($m) {
    if ((Get-ModArchives $m).Count -gt 0) { return $true }
    return (@($m.Files | Where-Object { $_ -and (Test-WholeArchiveCopy ([string]$_)) }).Count -gt 0)
}
function Update-ArchivesIfStale {
    $mods = @(Load-Db)
    $built = Get-BuiltArchives $mods
    if ($built.Count -eq 0) { return }
    foreach ($arc in @($built.Keys)) {
        $out = Join-Path (Join-Path $script:Game $ARCHIVE_DIR) $arc
        $mark = Get-BaseMarkPath $arc
        $now = Get-BaseMark $arc
        $was = $(if ([IO.File]::Exists($mark)) { [IO.File]::ReadAllText($mark).Trim() } else { "" })
        if (-not [IO.File]::Exists($out) -or $was -ne $now) { [void](Rebuild-Archives); return }
    }
}
# whole archive copies from mods: in the game only when the app isn't building a modded copy of that archive
function Update-WholeCopies {
    $mods = @(Load-Db)
    $rels = @($mods | ForEach-Object { @($_.Files) } | Where-Object { $_ -and (Test-WholeArchiveCopy ([string]$_)) } | ForEach-Object { [string]$_ } | Select-Object -Unique)
    if ($rels.Count -gt 0) { Sync-Files $rels $mods }
}

# is this a real line for that game file? (keeps readme sentences out)
function Test-DataLine([string]$target, [string]$t) {
    $leaf = Split-Path $target -Leaf
    if ($leaf -eq "handling.dat") {
        $tk = @($t -split '\s+')
        return ($tk.Count -ge 10 -and $tk[0] -match '^[%!$^]?[A-Za-z0-9_]{2,16}$' -and @($tk | Where-Object { $_ -match '^-?\d+(\.\d+)?[A-Za-z]?$' }).Count -ge 8)
    }
    if ($leaf -eq "vehicles.ide" -or $leaf -eq "peds.ide") { return ($t -match '^(?i)(cars|peds|end|txdp)$' -or ($t.Split(',').Count -ge 6 -and $t -match '^[A-Za-z0-9_]+\s*,')) }
    if ($leaf -eq "carcols.dat") { return ($t -match '^(?i)(col|car3|car4|end)$' -or $t -match '^[A-Za-z0-9_]+\s*,\s*\d+\s*,') }
    if ($leaf -eq "cargrp.dat" -or $leaf -eq "pedgrp.dat") { return ($t -match '^[A-Za-z0-9_]+\s*,.*#\s*\S+') }
    return ($t -match '(?i)^(IDE|IPL|IMG|CDIMAGE|COLFILE|HIERARCHY|TEXDICTION|MODELFILE|SPLASH|RADAR|MAPZONE)\b' -or $t -match '(?i)(common|pc|platform):/')
}
# a notes file with blocks like "# handling.dat" + lines: split into one small file per game file
function Split-LinesFile($path) {
    $out = @(); $cur = $null; $buf = @{}; $order = @()
    foreach ($raw in [IO.File]::ReadAllLines($path)) {
        $t = $raw.Trim()
        if (-not $t) { continue }
        $m = [regex]::Match($t, '^(?:#+|;+|//|-+|\[|=+|\*+)?\s*([A-Za-z0-9_]+\.(?:dat|ide|txt))\s*(?:\]|:|-+|=+|\*+)?\s*$')
        if ($m.Success -and $LINE_FILES.ContainsKey($m.Groups[1].Value.ToLower())) {
            $cur = $LINE_FILES[$m.Groups[1].Value.ToLower()]
            if (-not $buf.ContainsKey($cur)) { $buf[$cur] = New-Object System.Collections.ArrayList; $order += $cur }
            continue
        }
        if (-not $cur) { continue }
        if (Test-DataLine $cur $t) { [void]$buf[$cur].Add($t) }
    }
    foreach ($k in $order) {
        $ls = @($buf[$k] | ForEach-Object { [string]$_ })
        $data = @($ls | Where-Object { $_ -notmatch '^(?i)(cars|peds|end|txdp|col|car3|car4)$' })
        if ($data.Count -eq 0) { continue }
        $leaf = Split-Path $k -Leaf
        if (($leaf -eq "vehicles.ide" -or $leaf -eq "peds.ide") -and $ls[0] -notmatch '^(?i)(cars|peds|txdp)$') { $ls = @($(if ($leaf -eq "peds.ide") { "peds" } else { "cars" })) + $ls + @("end") }
        if ($leaf -eq "carcols.dat" -and $ls[0] -match '^(?i)(col|car3|car4)$' -and $ls[-1] -ine "end") { $ls += "end" }
        $out += [pscustomobject]@{ Target = $k; Lines = $ls; Count = $data.Count }
    }
    return $out
}
function Build-Plan($root, $modName) {
    $rows = New-Object System.Collections.ArrayList
    $files = @(Get-ChildItem $root -Recurse -File)
    $mod = Clean-Name $modName
    $script:PlanWarning = ""

    # Fusion Fix itself: installed exactly as it ships, your settings are kept
    # (a Fusion Fix copy inside another mod's "_installer_options" doesn't make the whole mod Fusion Fix)
    $ffAsi = $files | Where-Object { $_.Name -ieq "GTAIV.EFLC.FusionFix.asi" -and $_.FullName -notmatch '(?i)[\\/]_installer_options[\\/]' } | Select-Object -First 1
    if ($ffAsi) {
        $base = $(if ($ffAsi.Directory.Name -ieq "plugins") { $ffAsi.Directory.Parent.FullName } else { $ffAsi.DirectoryName })
        foreach ($f in $files) {
            if (-not $f.FullName.StartsWith($base + "\")) { [void]$rows.Add((New-Row $f.FullName "" "SKIP" "Not part of Fusion Fix")); continue }
            $rel = $f.FullName.Substring($base.Length).TrimStart("\")
            if (Is-Doc $f) { [void]$rows.Add((New-DocRow $f)); continue }
            if ($rel -ieq "plugins\GTAIV.EFLC.FusionFix.ini" -and (Test-Path (Join-Path $script:Game $rel))) {
                [void]$rows.Add((New-Row $f.FullName "" "SKIP" "Keeping your current Fusion Fix settings")); continue
            }
            [void]$rows.Add((New-Row $f.FullName $rel "CORE" "Fusion Fix"))
        }
        $script:PlanWarning = "This is Fusion Fix. It installs exactly as it ships and keeps your current settings."
        return $rows
    }

    # IV Tweaker only works on the old 1.0.7.0 / 1.0.8.0 game versions
    if (($files | Where-Object { $_.Name -ieq "IVTweaker.asi" }) -and (Test-CompleteEdition)) {
        foreach ($f in $files) { [void]$rows.Add((New-Row $f.FullName "" "MANUAL" "IV Tweaker doesn't support the Complete Edition")) }
        $script:PlanWarning = "IV Tweaker only works on GTA IV 1.0.7.0 / 1.0.8.0. Your game is the Complete Edition ($(Get-GameVersion)), so it would break or not load. Fusion Fix already does its job here - loose models are packed for it automatically."
        return $rows
    }
    # AddTools (add cars/weapons/animations): made for the old game versions - it swaps in old gta.dat, default.dat,
    # images.txt and handling.dat, and an old ScriptHook + dsound.dll loader. That breaks the Complete Edition / Fusion Fix.
    if (($files | Where-Object { $_.Name -match '(?i)^(Add_Tools_(IV|EFLC)|AT_Uninstall)\.exe$' }) -and (Test-CompleteEdition)) {
        foreach ($f in $files) { [void]$rows.Add((New-Row $f.FullName "" "MANUAL" "AddTools is for old GTA IV versions - it would break the Complete Edition")) }
        $script:PlanWarning = "AddTools is made for the old GTA IV (1.0.x). It replaces gta.dat, default.dat, images.txt and handling.dat with old copies and adds an old ScriptHook and loader - on your Complete Edition with Fusion Fix that breaks the game. Nothing was installed. Don't run its setup either."
        return $rows
    }
    # iCEnhancer (3.0 and 4.0): made only for GTA IV 1.0.3.0 - 1.0.4.0 with ENB, not the Complete Edition / Fusion Fix (its author says so)
    $iceHit = ($modName -match '(?i)icenhancer') -or ($files | Where-Object { $_.FullName -match '(?i)icenhancer' } | Select-Object -First 1)
    if ($iceHit -and (Test-CompleteEdition)) {
        foreach ($f in $files) { [void]$rows.Add((New-Row $f.FullName "" "MANUAL" "iCEnhancer only works on the old GTA IV 1.0.4.0, not the Complete Edition")) }
        $script:PlanWarning = "iCEnhancer is made only for the old GTA IV 1.0.3.0 - 1.0.4.0 (with ENB). Its main file can't run on your Complete Edition and it would break Fusion Fix's menu text, so nothing was installed."
        return $rows
    }
    $imgNames = @{}

    # folders that hold scripts or plugins: everything next to them goes along
    $scriptDirs = @{}; $asiDirs = @{}
    foreach ($f in $files) {
        $n = $f.Name.ToLower()
        if ($n.EndsWith(".net.dll") -or $f.Extension -ieq ".cs" -or $f.Extension -ieq ".vb") { $scriptDirs[$f.DirectoryName] = $true }
        if ($f.Extension -ieq ".asi") { $asiDirs[$f.DirectoryName] = $true }
    }

    # graphics presets (ENB, ReShade): the whole folder goes to the game folder as it is
    $gfxDirs = @{}
    foreach ($f in $files) {
        if ($WRAPPERS -notcontains $f.Name.ToLower()) { continue }
        $d = $f.DirectoryName
        $isGfx = (Test-Path (Join-Path $d "enbseries.ini")) -or (Test-Path (Join-Path $d "enblocal.ini")) -or (Test-Path (Join-Path $d "enbseries")) -or
                 (Test-Path (Join-Path $d "reshade-shaders")) -or (@(Get-ChildItem $d -Filter "ReShade*.ini" -ErrorAction SilentlyContinue).Count -gt 0) -or
                 (@(Get-ChildItem $d -Filter "*.fx" -ErrorAction SilentlyContinue).Count -gt 0) -or
                 (Test-Path (Join-Path $d "rtx_comp")) -or (Test-Path (Join-Path $d ".trex")) -or (Test-Path (Join-Path $d "rtx-remix")) -or
                 (Test-Path (Join-Path $d "rtx.conf")) -or (Test-Path (Join-Path $d "dxvk.conf"))   # RTX Remix / DXVK packages
        if ($isGfx) { $gfxDirs[$d] = $true }
    }

    # OpenIV packages: follow assembly.xml
    $oivHandled = @{}
    foreach ($asm in @(Get-ChildItem $root -Recurse -Filter assembly.xml -ErrorAction SilentlyContinue)) {
        try {
            [xml]$x = Get-Content $asm.FullName -Raw
            $content = $x.package.content
            $base = Join-Path $asm.DirectoryName "content"
            foreach ($add in @($content.add)) {
                if ($null -eq $add) { continue }
                $src = Join-Path $base ($add.source -replace "/", "\")
                $dst = ($add.'#text' -replace "/", "\").Trim()
                if (Test-Path $src) {
                    $oivHandled[(Resolve-Path $src).Path] = $true
                    [void]$rows.Add((Map-Row $src $dst $mod "OpenIV package"))
                }
            }
            foreach ($arc in @($content.archive)) {
                if ($null -eq $arc) { continue }
                foreach ($add in @($arc.add)) {
                    if ($null -eq $add) { continue }
                    $src = Join-Path $base ($add.source -replace "/", "\")
                    if (Test-Path $src) {
                        $oivHandled[(Resolve-Path $src).Path] = $true
                        $arcPath = ([string]$arc.path -replace "/", "\").Trim()
                        $innerPath = ([string]$add.'#text' -replace "\\", "/").Trim().TrimStart("/")
                        if ($arcPath -match '\.img$') {
                            [void]$rows.Add((New-Row $src ("update\$mod\" + (Get-ImgName $mod)) "IMG" ("Packed into an archive Fusion Fix loads (was for " + (Split-Path $arcPath -Leaf) + ")")))
                        } elseif ($arcPath -match '\.rpf$' -and ($arcPath -split '\.rpf\\').Count -eq 1) {
                            $arcRel = Find-ArchivePath (Split-Path $arcPath -Parent) (Split-Path $arcPath -Leaf)
                            if ($arcRel) { [void]$rows.Add([pscustomobject]@{ Source = $src; Dest = "$arcRel|$innerPath"; Kind = "ARCHIVE"; Note = "Packed into " + (Split-Path $arcRel -Leaf) + " automatically" }) }
                            else { [void]$rows.Add([pscustomobject]@{ Source = $src; Dest = ""; Kind = "MANUAL"; Note = "Goes inside " + $arcPath + ", which isn't in your game folder" }) }
                        } else {
                            [void]$rows.Add([pscustomobject]@{ Source = $src; Dest = ""; Kind = "MANUAL"; Note = "Goes inside an archive within an archive (" + $arcPath + ") - not supported yet" })
                        }
                    }
                }
            }
            if ($content.text -or $content.delete) {
                [void]$rows.Add([pscustomobject]@{ Source = $asm.FullName; Dest = ""; Kind = "MANUAL"; Note = "Package also edits text files - check its readme" })
            }
            $oivHandled[$asm.FullName] = $true
        } catch { }
    }

    $script:PlanHints = @(Get-ReadmeHints $files)
    # text inside the mod's own programs: a .txt they read by name is a data file, not a readme
    $codeText = New-Object System.Text.StringBuilder
    foreach ($cf in @($files | Where-Object { $_.Extension -match '(?i)^\.(dll|asi|cs|vb)$' -and $_.Length -lt 16MB })) {
        try { $b = [IO.File]::ReadAllBytes($cf.FullName); [void]$codeText.Append([Text.Encoding]::GetEncoding(28591).GetString($b)); [void]$codeText.Append([Text.Encoding]::Unicode.GetString($b)) } catch { }
    }
    $codeText = $codeText.ToString()
    # RTX Remix asset packs (a "mods" folder with .usda files) go to rtx-remix\mods
    $remixPack = [bool]($files | Where-Object { $_.Extension -match '(?i)^\.usd[ac]?$' } | Select-Object -First 1)
    foreach ($f in $files) {
        if ($oivHandled.ContainsKey($f.FullName)) { continue }
        if ($f.FullName -match "__oiv\\") { if ($f.Name -notmatch "\.(xml)$") { } ; continue }
        # a notes file that lists lines for handling.dat, vehicles.ide, carcols.dat... - the app adds them for you
        if ($f.Extension -match '(?i)^\.(txt|dat|ini)$' -and $f.Length -lt 1MB -and -not $LINE_FILES.ContainsKey($f.Name.ToLower())) {
            $parts = @(); try { $parts = @(Split-LinesFile $f.FullName) } catch { }
            if ($parts.Count -gt 0) {
                $tmpDir = Join-Path (Get-DataDir) ("temp\lines\" + [guid]::NewGuid().ToString("N"))
                foreach ($pt in $parts) {
                    $leaf = Split-Path $pt.Target -Leaf
                    $tf = Join-Path $tmpDir $leaf; New-ParentDir $tf
                    [IO.File]::WriteAllLines($tf, [string[]]$pt.Lines)
                    [void]$rows.Add((New-Row $tf (Get-UpdateDest $mod $pt.Target) "DATA LINES" ("From " + $f.Name + ": " + $pt.Count + " line" + $(if ($pt.Count -ne 1) { "s" } else { "" }) + " added to your game's " + $leaf)))
                }
                if ($f.Name -match '(?i)^read ?me') { [void]$rows.Add((New-DocRow $f)) }
                continue
            }
        }
        if ((Is-Doc $f) -and -not ($codeText -and $f.Name -notmatch '(?i)^read ?me' -and $codeText.IndexOf([IO.Path]::GetFileNameWithoutExtension($f.Name), [StringComparison]::OrdinalIgnoreCase) -ge 0)) { [void]$rows.Add((New-DocRow $f)); continue }

        $rel = $f.FullName.Substring($root.Length).TrimStart("\")
        $segs = $rel.Split("\")
        # folders the mod says to leave out ("_optional", "(do not copy)", "backup", "original files")
        $skipDir = @($segs | Select-Object -SkipLast 1 | Where-Object { $_ -match '(?i)do ?n.?t ?copy|dont ?copy|not ?copy|^_?optional\b|^backups?$|^original ?files$|^originals?$|^alternat' })
        if ($skipDir.Count -gt 0) { [void]$rows.Add((New-Row $f.FullName "" "SKIP" ("Left out - the mod's '" + $skipDir[0] + "' folder (double-click to add it anyway)"))); continue }
        $anchor = -1
        for ($i = 0; $i -lt $segs.Length - 1; $i++) {
            $s = $segs[$i].ToLower()
            if ($s -eq "update" -or $s -eq "scripts" -or $s -eq "plugins" -or $s -eq "rtx-remix" -or $s -eq "rtx_comp" -or $ROOTS -contains $s) { $anchor = $i; break }
        }
        $n = $f.Name.ToLower(); $e = $f.Extension.ToLower()
        if ($n -eq "dinput8.dll" -and (Test-Path (Join-Path $script:Game "plugins\GTAIV.EFLC.FusionFix.asi"))) {
            [void]$rows.Add((New-Row $f.FullName "" "MANUAL" "Would replace Fusion Fix's mod loader - left out so your .asi mods keep working")); continue
        }
        if ($remixPack -and $rel -notmatch '(?i)(^|[\\/])rtx-remix[\\/]' -and $rel -match '(?i)(^|[\\/])(mods[\\/].+)$') {
            [void]$rows.Add((New-Row $f.FullName ("rtx-remix\" + ($Matches[2] -replace '/', '\')) "GAME FOLDER" "RTX Remix assets")); continue
        }
        # extras for a mod's own installer: only the RTX Remix version of Fusion Fix is needed (RTX mod requires it)
        if ($rel -match '(?i)(^|[\\/])_installer_options[\\/]') {
            if ($rel -match '(?i)_installer_options[\\/]FusionFix_RTXRemixFork[\\/](.+)$') {
                $dst = $Matches[1]
                if ($dst -match '(?i)^(plugins|update|common|pc)\\' -or $dst -notmatch '\\') { [void]$rows.Add((New-Row $f.FullName $dst "GAME FOLDER" "RTX Remix version of Fusion Fix - this mod needs it (your old one is backed up)")); continue }
            }
            [void]$rows.Add((New-Row $f.FullName "" "SKIP" "Extra for the mod's own installer - not needed")); continue
        }
        if ($n -eq "xlive.dll" -or $n -eq "xlive_d.dll") { [void]$rows.Add((New-Row $f.FullName "" "MANUAL" "Only for old game versions (Games for Windows Live) - the Complete Edition doesn't need it")); continue }
        if ($LAUNCHERS -contains $n) { [void]$rows.Add((New-Row $f.FullName "" "MANUAL" "Replaces the game's launcher - never installed automatically")); continue }
        # files that live inside an .rpf archive can't be loaded loose
        if ($rel -match '^(.*?)([^\\]+\.rpf)\\(.+)$') {
            $arcPre = $Matches[1]; $arcName = $Matches[2]; $innerPath = $Matches[3] -replace "\\", "/"
            $arcRel = Find-ArchivePath $arcPre $arcName
            if ($arcRel) { [void]$rows.Add([pscustomobject]@{ Source = $f.FullName; Dest = "$arcRel|$innerPath"; Kind = "ARCHIVE"; Note = "Packed into $arcName automatically" }) }
            else { [void]$rows.Add((New-Row $f.FullName "" "MANUAL" ("Goes inside " + $arcName + ", which isn't in your game folder"))) }
            continue
        }
        # single pieces of Niko's clothes or face belong inside playerped.rpf
        if ($n -match '^(head|uppr|lowr|feet|hand|hair|teef|suse|sus2|accs|task|decl|jaw)_(diff_|normal_|spec_)?\d{3}_') {
            $arcRel = Find-ArchivePath "pc\models\cdimages\" "playerped.rpf"
            if ($arcRel) { [void]$rows.Add([pscustomobject]@{ Source = $f.FullName; Dest = "$arcRel|?" + $f.Name; Kind = "ARCHIVE"; Note = "Niko's clothes/face - packed into playerped.rpf automatically" }) }
            else { [void]$rows.Add((New-Row $f.FullName "" "MANUAL" "A piece of Niko (clothes/face) - playerped.rpf wasn't found in your game folder")) }
            continue
        }
        if ($anchor -ge 0) {
            $gamePath = ($segs[$anchor..($segs.Length - 1)] -join "\")
            $packIt = ($IMG_EXT -contains $e) -and (($gamePath -match '\\[^\\]+\.img\\') -or ($gamePath -match '^(update\\)?(tlad\\|tbogt\\)?pc\\models\\cdimages\\[^\\]+$'))
            if (-not $packIt) { [void]$rows.Add((Map-Row $f.FullName $gamePath $mod "")); continue }
        }
        if ($anchor -lt 0 -and $KNOWN_PATHS.ContainsKey($n)) {
            $kn = $(if ($KEYED.Contains($KNOWN_PATHS[$n])) { "Combined with your game's $n - only its own cars/peds are changed or added" } else { "Replaces the game's $n" })
            [void]$rows.Add((New-Row $f.FullName (Get-UpdateDest $mod $KNOWN_PATHS[$n]) "OVERLOADER" $kn)); continue
        }
        $gfxBase = ""
        foreach ($d in $gfxDirs.Keys) { if ($f.DirectoryName -eq $d -or $f.DirectoryName.StartsWith($d + [IO.Path]::DirectorySeparatorChar)) { $gfxBase = $d } }
        if ($gfxBase) {
            $sub = $f.FullName.Substring($gfxBase.Length).TrimStart("\")
            if ($sub -match '(?i)^_installer_options\\') { [void]$rows.Add((New-Row $f.FullName "" "SKIP" "Extra for the mod's own installer - not copied")); continue }
            [void]$rows.Add((New-Row $f.FullName $sub "GRAPHICS" "Graphics preset")); continue
        }
        if ($IMG_EXT -contains $e) {
            if ($imgNames.ContainsKey($n)) { [void]$rows.Add((New-Row $f.FullName "" "SKIP" "Another copy of this model in the mod - the first one is used")); continue }
            $imgNames[$n] = $true
            $hit = $null; try { $hit = Find-InArchives $f.Name } catch { }
            if ($hit) { [void]$rows.Add((New-ArchiveRow $f.FullName $hit $mod)); continue }
            [void](Get-ArchiveIndex)
            $newNote = $(if ($script:ArcIndex.Count -gt 0) { "New model (not in your game) - packed; an add-on may also need lines added, see its readme" } else { "Packed into an archive Fusion Fix loads" })
            [void]$rows.Add((New-Row $f.FullName ("update\$mod\" + (Get-ImgName $mod)) "IMG" $newNote)); continue
        }
        $inScriptDir = $false; $inAsiDir = $false; $scriptBase = ""; $asiBase = ""
        foreach ($d in $scriptDirs.Keys) { if ($f.DirectoryName -eq $d -or $f.DirectoryName.StartsWith($d + "\")) { $inScriptDir = $true; $scriptBase = $d } }
        foreach ($d in $asiDirs.Keys) { if ($f.DirectoryName -eq $d -or $f.DirectoryName.StartsWith($d + "\")) { $inAsiDir = $true; $asiBase = $d } }

        if ($e -eq ".dll" -and -not $n.EndsWith(".net.dll")) {
            [void]$rows.Add([pscustomobject]@{ Source = $f.FullName; Dest = $f.Name; Kind = "GAME FOLDER"; Note = "Helper library" }); continue
        }
        if ($e -eq ".asi" -or ($inAsiDir -and -not $inScriptDir -and -not ($MODEL_EXT -contains $e))) {
            $sub = $f.FullName.Substring($asiBase.Length).TrimStart("\")
            [void]$rows.Add([pscustomobject]@{ Source = $f.FullName; Dest = $sub; Kind = "GAME FOLDER"; Note = "Plugin" }); continue
        }
        if ($inScriptDir) {
            $sub = $f.FullName.Substring($scriptBase.Length).TrimStart("\")
            [void]$rows.Add([pscustomobject]@{ Source = $f.FullName; Dest = "scripts\" + $sub; Kind = "SCRIPT"; Note = "" }); continue
        }
        if ($e -eq ".img") {
            [void]$rows.Add([pscustomobject]@{ Source = $f.FullName; Dest = "update\$mod\" + $f.Name; Kind = "OVERLOADER"; Note = "Extra archive (Fusion loads it)" }); continue
        }
        # a file like one you already have (e.g. another Suit_*.ini of a script mod): put it next to those
        if ($e -ne ".exe") {
            $like = Find-Place $f
            if ($like) {
                $dest = $(if ($like.Folder) { $like.Folder + "\" + $f.Name } else { $f.Name })
                $kind = $(if ($dest -like "scripts\*") { "SCRIPT" } else { "GAME FOLDER" })
                [void]$rows.Add([pscustomobject]@{ Source = $f.FullName; Dest = $dest; Kind = $kind; Note = $like.Why }); continue
            }
        }
        if ($e -ne ".exe" -and $e -ne ".rpf" -and $e -ne ".img") {
            $hit = $null; try { $hit = Find-InArchives $f.Name } catch { }
            if ($hit) { [void]$rows.Add((New-ArchiveRow $f.FullName $hit $mod)); continue }
        }
        if ($DATA_EXT -contains $e) {
            [void]$rows.Add([pscustomobject]@{ Source = $f.FullName; Dest = ""; Kind = "MANUAL"; Note = "Game file with no folder path - double-click to choose where it goes" }); continue
        }
        if ($e -eq ".exe") { [void]$rows.Add((New-Row $f.FullName "" "MANUAL" "A program - run it yourself if the readme says so")); continue }
        $why = $(if ($e -match '^\.(ini|cfg|xml|txt|json)$') { "Settings for a script mod you don't have yet - double-click to choose its folder" } else { "Not sure where this goes - double-click to choose a folder" })
        [void]$rows.Add([pscustomobject]@{ Source = $f.FullName; Dest = ""; Kind = "MANUAL"; Note = $why })
    }
    # a second copy of a file the mod already places (e.g. another version's gta.dat): skip it, the first one is used
    $placed = @{}
    foreach ($r in $rows) { if ($r.Dest) { $placed[[IO.Path]::GetFileName([string]$r.Source).ToLower()] = $true } }
    foreach ($r in $rows) {
        if ($r.Kind -eq "MANUAL" -and $placed.ContainsKey([IO.Path]::GetFileName([string]$r.Source).ToLower())) { $r.Kind = "SKIP"; $r.Note = "Another copy of this file in the mod - the first one is used" }
    }
    return $rows
}

# ---- things to know before installing: missing helper tools, old mods that clash with Fusion Fix, steps the readme wants done by hand ----
$HELPERS = @(
    @{ Name = "ScriptHookDotNet"; Words = '(?i)script\s*hook\s*(dot\s*)?\.?net|scripthookdotnet|shdn'; Files = @("ScriptHookDotNet.asi", "ScriptHookDotNet.dll") },
    @{ Name = "ScriptHook"; Words = '(?i)\bscript\s*hook\b(?!\s*(dot\s*)?\.?net)'; Files = @("ScriptHook.dll") },
    @{ Name = "Fusion Fix"; Words = '(?i)fusion\s*fix'; Files = @("plugins\GTAIV.EFLC.FusionFix.asi") },
    @{ Name = "ZolikaPatch"; Words = '(?i)zolika\s*patch'; Files = @("ZolikaPatch.asi", "plugins\ZolikaPatch.asi") },
    @{ Name = "IV-SDK .NET"; Words = '(?i)iv-?\s*sdk\s*\.?\s*net|ivsdkdotnet'; Files = @("IVSDKDotNet.asi", "plugins\IVSDKDotNet.asi") },
    @{ Name = "IV Tweaker"; Words = '(?i)iv\s*tweaker'; Files = @("*tweaker*.asi", "plugins\*tweaker*.asi") }
)
function Test-HelperThere($h, $plan) {
    foreach ($f in $h.Files) {
        if (@(Get-ChildItem -Path (Join-Path $script:Game $f) -ErrorAction SilentlyContinue).Count -gt 0) { return $true }
        $leaf = Split-Path $f -Leaf
        foreach ($r in @($plan)) { if ($r.Dest -and (Split-Path ([string]$r.Dest) -Leaf) -like $leaf) { return $true } }   # the mod brings it
    }
    return $false
}
function Get-ModChecks($root, $plan) {
    $out = New-Object System.Collections.ArrayList
    if (-not $script:Game) { return $out }
    $placed = @($plan | Where-Object { $_.Dest -and $_.Kind -ne "SKIP" -and $_.Kind -ne "MANUAL" -and $_.Kind -ne "PREVIEW" })
    $hasNet = @($placed | Where-Object { [string]$_.Dest -match '(?i)\.(net\.dll|cs|vb)$' }).Count -gt 0
    $hasAsi = @($placed | Where-Object { [string]$_.Dest -match '(?i)\.asi$' }).Count -gt 0
    $readme = @()
    foreach ($f in @(Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Length -lt 1MB -and ($_.Extension -match '^\.(txt|md|nfo)$') -and $_.Name -notmatch '(?i)licen[cs]e|gpl' })) {
        try { $readme += @(Get-Content -LiteralPath $f.FullName -ErrorAction SilentlyContinue) } catch { }
    }
    $text = ($readme -join "`n")
    $need = @()
    foreach ($h in $HELPERS) {
        $why = ""
        if ($h.Name -eq "ScriptHookDotNet" -and $hasNet) { $why = "it has .NET scripts" }
        elseif ($text -match $h.Words -and ($readme | Where-Object { $_ -match $h.Words -and $_ -match '(?i)requir|need|must|dependen|prerequisite|install .* first' -and $_ -notmatch '(?i)method|option|alternative|if you (use|have|want|prefer)|instead' })) { $why = "the readme says it needs it" }
        if ($why -and -not (Test-HelperThere $h $plan)) { $need += $h.Name; [void]$out.Add("Needs $($h.Name) ($why) - you don't have it. Without it the mod won't work in the game.") }
    }
    if ($hasAsi -and -not (Test-Path (Join-Path $script:Game "dinput8.dll")) -and -not (Test-Path (Join-Path $script:Game "xlive.dll"))) { [void]$out.Add("Has .asi plugins but you have no ASI loader (dinput8.dll) - they won't load. Fusion Fix comes with one.") }
    if (($hasAsi -or $hasNet) -and $text -match '(?i)\b1\.0\.(4|6|7|8)\.0\b|\b10[4678]0\b|downgrad') { [void]$out.Add("The readme talks about old game versions (1.0.7 / 1.0.8 / downgrading). Its scripts may not work on the Complete Edition.") }
    # old mods that change files Fusion Fix has its own version of
    $ffFiles = @{}
    foreach ($m in @(Load-Db)) {
        if (@($m.Files) -notcontains "plugins\GTAIV.EFLC.FusionFix.asi") { continue }
        foreach ($f in @($m.Files)) { if ([string]$f -match '(?i)^update\\') { $ffFiles[(Get-GamePath ([string]$f))] = $true } }
    }
    if ($ffFiles.Count -eq 0) {
        foreach ($d in @("update\common\shaders", "update\pc\data", "update\pc\textures")) {
            $full = Join-Path $script:Game $d
            if (Test-Path $full) { foreach ($f in @(Get-ChildItem -LiteralPath $full -Recurse -File -ErrorAction SilentlyContinue)) { $ffFiles[(Get-GamePath ($f.FullName.Substring($script:Game.Length).TrimStart("\")))] = $true } }
        }
    }
    $clash = @(); $shaders = $false
    foreach ($r in $placed) {
        if ($r.Kind -ne "OVERLOADER") { continue }
        $gp = Get-GamePath ([string]$r.Dest)
        if ($gp -match '\\shaders\\' ) { $shaders = $true }
        if ($ffFiles.ContainsKey($gp)) { $clash += (Split-Path $gp -Leaf) }
    }
    if ($shaders) { [void]$out.Add("Shader mod: most shader mods are older than Fusion Fix and can break it (for example invisible people). Fusion Fix's own shaders are always kept.") }
    elseif ($clash.Count -gt 0) { [void]$out.Add("Replaces files Fusion Fix has its own version of: " + (($clash | Select-Object -First 4) -join ", ") + $(if ($clash.Count -gt 4) { "..." } else { "" }) + ". If something looks wrong in the game, turn this mod off.") }
    # steps the readme wants done by hand (gta.dat / images.txt / default.dat lines are added by the app)
    $doneLeafs = @($placed | Where-Object { $MERGE_TARGETS -contains (Get-GamePath ([string]$_.Dest)) } | ForEach-Object { [regex]::Escape((Split-Path ([string]$_.Dest) -Leaf)) } | Select-Object -Unique)
    $doneData = $(if ($doneLeafs.Count -gt 0) { '(?i)' + ($doneLeafs -join '|') } else { "" })
    $hand = @()
    foreach ($l in $readme) {
        $t = ([string]$l).Trim()
        if ($t.Length -lt 8 -or $t.Length -gt 300) { continue }
        if ($t -match '(?i)gta\.dat|images\.txt|default\.dat') { continue }
        if ($doneData -and $t -match $doneData) { continue }
        if ($t -match '(?i)\badd (this|these|the following)\b.*\blines?\b|\b(open|edit)\b.*\.(ini|cfg|txt|xml|dat|ide|meta)\b|\breplace the line\b|\bchange the value\b|\bat the (bottom|end|top) of (your|the)\b') { $hand += $(if ($t.Length -gt 120) { $t.Substring(0, 117) + "..." } else { $t }) }
    }
    if ($hand.Count -gt 0) { [void]$out.Add("The readme asks you to do something by hand. The app can't do that for you:`n     - " + (($hand | Select-Object -First 3) -join "`n     - ")) }
    return $out
}

function Map-Row($src, $gamePath, $mod, $note) {
    $segs = $gamePath.Split("\")
    $first = $segs[0].ToLower()
    if ($first -eq "update") {
        $rest = @($segs[1..($segs.Length - 1)])
        if ($rest.Length -gt 1 -and $ROOTS -contains $rest[0].ToLower()) { $dest = Get-UpdateDest $mod ($rest -join "\") }
        else { $dest = "update\" + ($rest -join "\") }
        return [pscustomobject]@{ Source = $src; Dest = $dest; Kind = "OVERLOADER"; Note = $note }
    }
    if ($ROOTS -contains $first) { return [pscustomobject]@{ Source = $src; Dest = (Get-UpdateDest $mod $gamePath); Kind = "OVERLOADER"; Note = $note } }
    if ($first -eq "scripts") { return [pscustomobject]@{ Source = $src; Dest = $gamePath; Kind = "SCRIPT"; Note = $note } }
    if ($first -eq "plugins") { return [pscustomobject]@{ Source = $src; Dest = $gamePath; Kind = "GAME FOLDER"; Note = $note } }
    return [pscustomobject]@{ Source = $src; Dest = $gamePath; Kind = "GAME FOLDER"; Note = $note }
}

# the file the game actually sees, whichever update subfolder it sits in
function Get-GamePath($rel) {
    $segs = $rel.Split("\")
    if ($segs[0] -ine "update" -or $segs.Length -lt 3) { return $rel.ToLower() }
    if ($ROOTS -contains $segs[1].ToLower()) { return ($segs[1..($segs.Length - 1)] -join "\").ToLower() }
    return ($segs[2..($segs.Length - 1)] -join "\").ToLower()
}

# ----------------------------------------------------------------------------
#  Install / uninstall
# ----------------------------------------------------------------------------
function Install-Plan {
    $mods = @(Load-Db)
    $mod = Clean-Name $script:PlanMod
    if ($mods | Where-Object { $_.Name -eq $mod }) {
        $r = [System.Windows.Forms.MessageBox]::Show("'$mod' is already in your garage. Replace it with this one?", "Liberty City Mod Loader IV", "YesNo", "Question")
        if ($r -ne "Yes") { return }
        $oldSrc = Get-ModSource (@($mods | Where-Object { $_.Name -eq $mod })[0])
        if (-not $script:PlanSource -and $oldSrc) { $script:PlanSource = $oldSrc }
        Uninstall-Mod $mod $true
        $mods = @(Load-Db)
    }

    # things to know (missing helpers, Fusion Fix clashes, readme steps)
    if (@($script:PlanChecks | Where-Object { $_ }).Count -gt 0) {
        $msg = "Before you install '$mod':`n`n" + ((@($script:PlanChecks | Where-Object { $_ }) | ForEach-Object { "- " + $_ }) -join "`n`n") + "`n`nInstall anyway?"
        $r = [System.Windows.Forms.MessageBox]::Show($msg, "Liberty City Mod Loader IV", "YesNo", "Information")
        if ($r -ne "Yes") { Set-Status "Install cancelled. Nothing was changed." $C_DIM; return }
    }
    # LCPD check before anything is copied
    $warn = @()
    $gamePaths = @{}
    if (Test-Path (Join-Path $script:Game "update")) {
        foreach ($f in Get-ChildItem (Join-Path $script:Game "update") -Recurse -File -ErrorAction SilentlyContinue) {
            $rel = $f.FullName.Substring($script:Game.Length).TrimStart("\")
            $gamePaths[(Get-GamePath $rel)] = $rel
        }
    }
    foreach ($row in $script:Plan) {
        if (-not $row.Dest) { continue }
        if ($row.Kind -ne "CORE" -and $WRAPPERS -contains $row.Dest.ToLower() -and (Test-Path (Join-Path $script:Game $row.Dest)) -and -not (Get-Owner $row.Dest $mods)) {
            $warn += "$($row.Dest)  (you already have one - from Fusion Fix or another graphics mod. It's backed up, and turning this mod off puts it back)"
            continue
        }
        $owner = Get-Owner $row.Dest $mods
        if ($row.Kind -eq "ARCHIVE") {
            $pp = $row.Dest.Split("|", 2)
            foreach ($om in $mods) {
                if (-not (Test-ModOn $om)) { continue }
                foreach ($it in (Get-ModArchives $om)) { if ($it.Archive -ieq $pp[0] -and ([string]$it.Inner).TrimStart("?") -ieq $pp[1].TrimStart("?")) { $warn += "$(Split-Path $pp[0] -Leaf) > $($pp[1].TrimStart('?'))  (also changed by '$($om.Name)')" } }
            }
            continue
        }
        if ($owner) { $warn += "$($row.Dest)  (belongs to '$owner')" }
        elseif ($row.Kind -eq "OVERLOADER") {
            $gp = Get-GamePath $row.Dest
            if ($gamePaths.ContainsKey($gp) -and $gamePaths[$gp] -ine $row.Dest -and $MERGE_TARGETS -notcontains $gp -and $gamePaths[$gp] -notmatch '(?i)^update\\LC Installer') { $warn += "$gp  (already replaced by $($gamePaths[$gp]))" }
        }
    }
    if ($warn.Count -gt 0) {
        $msg = "LCPD records show this mod clashes with what you already have:`n`n" + (($warn | Select-Object -First 12) -join "`n")
        if ($warn.Count -gt 12) { $msg += "`n...and $($warn.Count - 12) more" }
        $msg += "`n`nOnly one version of each file can be used. Install anyway?"
        $r = [System.Windows.Forms.MessageBox]::Show($msg, "LCPD Warning", "YesNo", "Warning")
        if ($r -ne "Yes") { Set-Status "Install cancelled. Nothing was changed." $C_DIM; return }
    }

    # every file goes into the mod's own copy first, then into the game
    $files = @()
    $imgRows = @($script:Plan | Where-Object { $_.Kind -eq "IMG" })
    foreach ($row in $script:Plan) {
        if (-not $row.Dest -or $row.Kind -eq "IMG" -or $row.Kind -eq "ARCHIVE") { continue }
        $lf = Get-LibFile $mod $row.Dest
        New-ParentDir $lf
        Copy-Item -LiteralPath $row.Source -Destination $lf -Force
        if (@($files) -inotcontains [string]$row.Dest) { $files += $row.Dest }
        if ([string]$row.Note -like "RTX Remix version of Fusion Fix*") {
            $keep = Join-Path (Get-DataDir) ("rtx-ff-fork\" + $row.Dest)
            $kd = Split-Path $keep -Parent
            if (-not (Test-Path $kd)) { New-Item -ItemType Directory $kd -Force | Out-Null }
            Copy-Item $row.Source $keep -Force
        }
    }
    if ($imgRows.Count -gt 0) {
        $rel = $imgRows[0].Dest
        $dest = Get-LibFile $mod $rel
        New-ParentDir $dest
        try {
            New-ImgArchive @($imgRows | ForEach-Object { $_.Source }) $dest
            $files += $rel
        } catch { Set-Status ("Couldn't pack the models: " + $_.Exception.Message) $C_RED }
    }
    # files that go inside game archives: kept here, then packed into a modded copy
    $arcRows = @($script:Plan | Where-Object { $_.Kind -eq "ARCHIVE" })
    $archives = @()
    if ($arcRows.Count -gt 0) {
        Offer-ArchiveBackup @($arcRows | ForEach-Object { $_.Dest.Split("|", 2)[0] })
        $storeRel = "archives\" + $mod
        $storeDir = Join-Path (Get-DataDir) $storeRel
        if (-not (Test-Path $storeDir)) { New-Item -ItemType Directory $storeDir -Force | Out-Null }
        $n = 0
        foreach ($row in $arcRows) {
            $n++
            $pp = $row.Dest.Split("|", 2)
            $name = ("{0:D4}_" -f $n) + [IO.Path]::GetFileName($row.Source)
            Copy-Item -LiteralPath $row.Source -Destination (Join-Path $storeDir $name) -Force
            $archives += [pscustomobject]@{ Archive = $pp[0]; Inner = $pp[1]; Store = "$storeRel\$name" }
        }
    }
    $entry = [pscustomobject]@{ Name = $mod; Date = (Get-Date).ToString("yyyy-MM-dd HH:mm"); Files = $files; Backups = @(); Enabled = $true; Archives = $archives; Library = $true }
    if ($script:PlanSource) {
        $srcCopy = $script:PlanSource | Select-Object *
        $srcCopy | Add-Member -NotePropertyName InstalledAt -NotePropertyValue ([long]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())) -Force
        $srcCopy | Add-Member -NotePropertyName Update -NotePropertyValue "" -Force
        $entry | Add-Member -NotePropertyName Source -NotePropertyValue $srcCopy -Force
    }
    # its picture for My Mods: the first preview picture in the mod, or its Nexus picture
    try {
        $pic = @($script:Plan | Where-Object { $_.Kind -eq "PREVIEW" -and (Test-Path -LiteralPath $_.Source) } | Select-Object -First 1)
        if ($pic.Count -gt 0) { Save-Thumb $mod $pic[0].Source }
        elseif ($script:PlanSource -and $script:PlanSource.Picture) { Save-ThumbFromUrl $mod ([string]$script:PlanSource.Picture) }
    } catch { }
    $mods = @(@($mods) + $entry)
    Save-Db $mods
    Set-Status "Putting '$mod' in the game..." $C_DIM $false; try { $form.Refresh() } catch { }
    Sync-Files $files $mods
    $packed = $true
    if ($archives.Count -gt 0 -or (Test-TouchesArchive $entry)) { $packed = Rebuild-Archives; $files += @($archives | ForEach-Object { $_.Inner }) }

    $manual = @($script:Plan | Where-Object { $_.Kind -eq "MANUAL" }).Count
    if (-not $packed) { }   # the packing error is already showing
    elseif ($manual -gt 0) { Set-Status "Delivered '$mod' ($($files.Count) files). $manual file(s) couldn't be placed - see the list." $C_AMBER }
    else { Set-Status "Delivered. '$mod' has arrived in Liberty City ($($files.Count) files)." $C_GREEN }
    $rtxInstalled = [bool]($script:Plan | Where-Object { $_.Dest -match '(?i)(^|[\\/])rtx_comp[\\/]' } | Select-Object -First 1)
    Clear-Plan
    Refresh-Garage
    Refresh-Essentials
    if ($rtxInstalled) { Offer-RtxBaseMod }
    if (@($script:UpdateQueue).Count -gt 0) { Start-NextUpdate }
}


# GTA IV RTX Remix needs its free "base mod" (rtx-remix\mods\gta4rtx) - the app can fetch it
$RTX_BASE_URL = "https://github.com/xoxor4d/gta4-rtx-base-mod/archive/refs/heads/master.zip"
function Offer-RtxBaseMod {
    if (Test-Path -LiteralPath (Join-Path $script:Game "rtx-remix\mods\gta4rtx\mod.usda")) { return }
    $r = [System.Windows.Forms.MessageBox]::Show("GTA IV RTX Remix also needs its Base Remix Mod (free, from the RTX mod's author on GitHub).`n`nDownload it now? It opens in Install - then press Install.", "One more piece needed", "YesNo", "Question")
    if ($r -ne "Yes") { Set-Status "RTX Remix won't fully work until the Base Remix Mod is installed." $C_AMBER; return }
    Start-ModDownload $RTX_BASE_URL "gta4-rtx-base-mod.zip" "RTX Base Mod"
}

# removes folders a mod left empty (never the game folder itself or its main folders)
function Remove-EmptyDirs($startDir) {
    $d = $startDir
    while ($d -and $d.Length -gt $script:Game.Length) {
        $leaf = (Split-Path $d -Leaf).ToLower()
        if ((Split-Path $d -Parent) -eq $script:Game -and @("update", "scripts", "plugins", "pc", "common", "tlad", "tbogt") -contains $leaf) { break }
        if ((Test-Path $d) -and @(Get-ChildItem $d -Force -ErrorAction SilentlyContinue).Count -eq 0) { Remove-Item $d -Force; $d = Split-Path $d -Parent } else { break }
    }
}

# a mod installed AFTER $m that also put this file in place (its version must stay)
function Get-LaterOwner($m, $rel, $mods) {
    $after = $false
    foreach ($o in @($mods)) {
        if ($o.Name -eq $m.Name) { $after = $true; continue }
        if ($after -and (Test-ModOn $o) -and (@($o.Files | ForEach-Object { [string]$_ }) -icontains [string]$rel)) { return $o }
    }
    return $null
}
function Uninstall-Mod($name, [bool]$quiet = $false) {
    $mods = @(Load-Db)
    $m = $mods | Where-Object { $_.Name -eq $name } | Select-Object -First 1
    if (-not $m) { return }
    if (-not (Test-InLibrary $m)) { Convert-ToLibrary; $mods = @(Load-Db); $m = $mods | Where-Object { $_.Name -eq $name } | Select-Object -First 1 }
    $rest = @($mods | Where-Object { $_.Name -ne $name })
    Save-Db $rest
    # each file goes back to the next mod that has it, or to the file from before any mod
    Sync-Files @($m.Files) $rest
    $lib = Join-Path (Get-DataDir) ("library\" + $name)
    if (Test-Path -LiteralPath $lib) { Remove-Item -LiteralPath $lib -Recurse -Force }
    if (Test-TouchesArchive $m) {
        [void](Rebuild-Archives)
        $arcStore = Join-Path (Get-DataDir) ("archives\" + $name)
        if (Test-Path $arcStore) { Remove-Item $arcStore -Recurse -Force }
    }
    if (-not $quiet) { Set-Status "'$name' shipped back out of Liberty City. Replaced files were restored." $C_GREEN }
    Refresh-Garage
}

# Off: the mod keeps its files in its own copy; the game gets back what was there before (or another mod's version)
function Disable-Mod($name) {
    $mods = @(Load-Db)
    $m = $mods | Where-Object { $_.Name -eq $name } | Select-Object -First 1
    if (-not $m -or -not (Test-ModOn $m)) { return }
    if (-not (Test-InLibrary $m)) { Convert-ToLibrary; $mods = @(Load-Db); $m = $mods | Where-Object { $_.Name -eq $name } | Select-Object -First 1 }
    $m | Add-Member -NotePropertyName Enabled -NotePropertyValue $false -Force
    Save-Db $mods
    Sync-Files @($m.Files) $mods
    if (Test-TouchesArchive $m) { [void](Rebuild-Archives) }
    Set-Status "'$name' is off. Its files are kept safe - turn it back on any time." $C_DIM
}

# On: its files go back in. If other mods that are on have the same files, you choose who wins.
function Enable-Mod($name) {
    $mods = @(Load-Db)
    $m = $mods | Where-Object { $_.Name -eq $name } | Select-Object -First 1
    if (-not $m -or (Test-ModOn $m)) { return }
    if (-not (Test-InLibrary $m)) { Convert-ToLibrary; $mods = @(Load-Db); $m = $mods | Where-Object { $_.Name -eq $name } | Select-Object -First 1 }
    $others = @($mods | Where-Object { $_.Name -ne $name })
    $clash = @(); $clashMods = @()
    foreach ($rel in @($m.Files)) { $o = Get-Owner $rel $others; if ($o) { $clash += "$rel  ('$o')"; if ($clashMods -notcontains $o) { $clashMods += $o } } }
    foreach ($it in (Get-ModArchives $m)) {
        foreach ($om in $others) {
            if (-not (Test-ModOn $om)) { continue }
            foreach ($x in (Get-ModArchives $om)) { if ($x.Archive -ieq $it.Archive -and ([string]$x.Inner).TrimStart("?") -ieq ([string]$it.Inner).TrimStart("?")) { $clash += "$(Split-Path $it.Archive -Leaf) > $(([string]$it.Inner).TrimStart('?'))  ('$($om.Name)')"; if ($clashMods -notcontains $om.Name) { $clashMods += $om.Name } } }
        }
    }
    if ($clash.Count -gt 0) {
        $msg = "'$name' changes the same files as: " + ($clashMods -join ", ") + "`n`n" + (($clash | Select-Object -First 8) -join "`n")
        if ($clash.Count -gt 8) { $msg += "`n...and $($clash.Count - 8) more" }
        $msg += "`n`nYes = '$name' wins (its files are used)`nNo = keep the other mod's files, turn '$name' on for the rest`nCancel = leave it off"
        $r = [System.Windows.Forms.MessageBox]::Show($msg, "Two mods, same files", "YesNoCancel", "Question")
        if ($r -eq "Cancel") { return $false }
        if ($r -eq "Yes") { $mods = @($others) + $m }         # lower in the list = wins
        else {
            # just above the first mod it clashes with, so that mod keeps winning
            $at = 0; for ($i = 0; $i -lt $others.Count; $i++) { if ($clashMods -contains $others[$i].Name) { $at = $i; break } }
            $mods = @($others | Select-Object -First $at) + $m + @($others | Select-Object -Skip $at)
        }
    }
    $m | Add-Member -NotePropertyName Enabled -NotePropertyValue $true -Force
    Save-Db $mods
    Sync-Files @($m.Files) $mods
    if (Test-TouchesArchive $m) { [void](Rebuild-Archives) }
    $missing = @($m.Files | Where-Object { $_ -and -not ([string]$_).Contains("|") -and -not (Test-Path -LiteralPath (Get-LibFile $m.Name ([string]$_))) }).Count
    if ($missing -gt 0) { Set-Status "'$name' is on, but $missing file(s) were missing. Reinstall it if it misbehaves." $C_AMBER }
    else { Set-Status "'$name' is back on." $C_GREEN }
    return $true
}

# ----------------------------------------------------------------------------
#  Pictures for My Mods
# ----------------------------------------------------------------------------
function Get-ThumbPath($name) { return (Join-Path (Get-DataDir) ("thumbs\" + (($name -replace '[\\/:*?"<>|]', '_')) + ".png")) }
function Save-ThumbImage($name, $img) {
    $w = 192; $h = 108
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
        $g.InterpolationMode = "HighQualityBicubic"
        $sc = [math]::Max($w / $img.Width, $h / $img.Height)
        $dw = $img.Width * $sc; $dh = $img.Height * $sc
        $g.DrawImage($img, [single](($w - $dw) / 2), [single](($h - $dh) / 2), [single]$dw, [single]$dh)
    } finally { $g.Dispose() }
    $out = Get-ThumbPath $name
    New-ParentDir $out
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
    $script:ThumbCache = $null
}
function Save-Thumb($name, $path) {
    $bytes = [IO.File]::ReadAllBytes($path)
    $ms = New-Object IO.MemoryStream(, $bytes)
    $img = [System.Drawing.Image]::FromStream($ms)
    try { Save-ThumbImage $name $img } finally { $img.Dispose(); $ms.Dispose() }
}
function Save-ThumbFromUrl($name, [string]$url) {
    if (-not $url) { return }
    $wc = New-Object System.Net.WebClient
    $wc.Headers.Add("User-Agent", "LibertyCityModInstaller/1.0")
    try {
        $bytes = $wc.DownloadData($url)
        $ms = New-Object IO.MemoryStream(, $bytes)
        $img = [System.Drawing.Image]::FromStream($ms)
        try { Save-ThumbImage $name $img } finally { $img.Dispose(); $ms.Dispose() }
    } finally { $wc.Dispose() }
}
function Load-Thumbs($mods) {
    if (-not $script:UI) { return }
    try { $lvGarage.Thumbs.Clear() } catch { return }
    if (-not $script:ThumbCache) { $script:ThumbCache = @{} }
    foreach ($m in @($mods)) {
        $p = Get-ThumbPath ([string]$m.Name)
        if (-not [IO.File]::Exists($p)) { continue }
        $k = $p + "|" + [IO.File]::GetLastWriteTimeUtc($p).Ticks
        if (-not $script:ThumbCache.ContainsKey($k)) {
            try { $b = [IO.File]::ReadAllBytes($p); $ms = New-Object IO.MemoryStream(, $b); $script:ThumbCache[$k] = [System.Drawing.Image]::FromStream($ms) } catch { continue }
        }
        $lvGarage.Thumbs[[string]$m.Name] = $script:ThumbCache[$k]
    }
}

# ----------------------------------------------------------------------------
#  Mod updates (Nexus)
# ----------------------------------------------------------------------------
function Get-VerKey([string]$v) { return (($v -replace '(?i)^v', '' -replace '[\s_-]+', '.').Trim('.').ToLower()) }
# mods you had before this was added: the Nexus number from the file you downloaded, if it's still there
function Find-NexusSources($mods) {
    $dirs = @((Join-Path (Get-DataDir) "downloads"), (Get-DownloadsFolder))
    $cands = @()
    foreach ($d in $dirs) { if (Test-Path -LiteralPath $d) { $cands += @(Get-ChildItem -LiteralPath $d -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -match '^\.(zip|rar|7z|oiv)$' }) } }
    $changed = $false
    foreach ($m in @($mods)) {
        if (Get-ModSource $m) { continue }
        $want = (Clean-Name ([string]$m.Name)).ToLower() -replace '[^a-z0-9]', ''
        if (-not $want) { continue }
        foreach ($c in $cands) {
            $nx = Get-NexusFromName $c.Name
            if (-not $nx) { continue }
            $have = (Clean-Name $nx.Name).ToLower() -replace '[^a-z0-9]', ''
            if ($have -and ($have -eq $want -or $want.Contains($have) -or $have.Contains($want))) {
                $src = $nx.Source; $src | Add-Member -NotePropertyName InstalledAt -NotePropertyValue ([long]([DateTimeOffset]$c.LastWriteTime).ToUnixTimeSeconds()) -Force
                $src | Add-Member -NotePropertyName Update -NotePropertyValue "" -Force
                $m | Add-Member -NotePropertyName Source -NotePropertyValue $src -Force
                $changed = $true; break
            }
        }
    }
    return $changed
}
function Check-Updates([bool]$ask = $true) {
    if (-not (Get-NexusKey)) {
        [System.Windows.Forms.MessageBox]::Show("To check for updates, add your free Nexus Mods API key first (Settings > Nexus Mods account).", "Updates", "OK", "Information") | Out-Null
        return
    }
    $mods = @(Load-Db)
    $changed = Find-NexusSources $mods
    $nx = @($mods | Where-Object { (Get-ModSource $_) -and (Get-ModSource $_).NexusId })
    if ($nx.Count -eq 0) {
        if ($changed) { Save-Db $mods }
        [System.Windows.Forms.MessageBox]::Show("None of your mods are linked to Nexus yet.`n`nMods you download through the app (or with Nexus' 'Mod Manager Download' button) are linked by themselves - then they can be checked for updates.", "Updates", "OK", "Information") | Out-Null
        return
    }
    $found = @(); $i = 0
    foreach ($m in $nx) {
        $i++
        $src = Get-ModSource $m
        Set-Status "Checking for updates ($i of $($nx.Count)): $($m.Name)..." $C_DIM $false; try { $form.Refresh() } catch { }
        try {
            $info = Invoke-Nexus "games/$NEXUS_GAME/mods/$($src.NexusId).json"
            $files = Invoke-Nexus "games/$NEXUS_GAME/mods/$($src.NexusId)/files.json"
            $main = @($files.files | Where-Object { $_.category_name -eq "MAIN" } | Sort-Object uploaded_timestamp -Descending)
            if ($main.Count -eq 0) { $main = @($files.files | Where-Object { $_.category_name -ne "OLD_VERSION" -and $_.category_name -ne "ARCHIVED" } | Sort-Object uploaded_timestamp -Descending) }
            if ($info.picture_url) { $src | Add-Member -NotePropertyName Picture -NotePropertyValue ([string]$info.picture_url) -Force }
            $new = ""
            if ($main.Count -gt 0) {
                $top = $main[0]
                $since = $(if ($src.PSObject.Properties["Uploaded"] -and [long]$src.Uploaded -gt 0) { [long]$src.Uploaded } elseif ($src.PSObject.Properties["InstalledAt"]) { [long]$src.InstalledAt } else { 0 })
                $sameFile = ($src.FileId -and [string]$top.file_id -eq [string]$src.FileId)
                $sameVer = ($src.Version -and $top.version -and (Get-VerKey ([string]$top.version)) -eq (Get-VerKey ([string]$src.Version)))
                if (-not $sameFile -and -not $sameVer -and [long]$top.uploaded_timestamp -gt $since) {
                    $new = $(if ($top.version) { [string]$top.version } else { "new" })
                    $src | Add-Member -NotePropertyName LatestFileId -NotePropertyValue ([string]$top.file_id) -Force
                    $found += $m
                }
            }
            $src | Add-Member -NotePropertyName Update -NotePropertyValue $new -Force
            if (-not [IO.File]::Exists((Get-ThumbPath ([string]$m.Name))) -and $src.Picture) { try { Save-ThumbFromUrl ([string]$m.Name) ([string]$src.Picture) } catch { } }
        } catch { }
    }
    Save-Db $mods
    Refresh-Garage
    if ($found.Count -eq 0) { Set-Status "All $($nx.Count) Nexus mod(s) are up to date." $C_GREEN; return }
    Set-Status "$($found.Count) update(s) available." $C_GREEN
    if (-not $ask) { return }
    $lines = @($found | ForEach-Object { "- " + $_.Name + ":  " + $(if ((Get-ModSource $_).Version) { (Get-ModSource $_).Version } else { "?" }) + "  ->  " + (Get-ModSource $_).Update })
    $r = [System.Windows.Forms.MessageBox]::Show("Updates found:`n`n" + ($lines -join "`n") + "`n`nUpdate them now? Each one opens in Install - check it and press Install.", "Updates", "YesNo", "Question")
    if ($r -eq "Yes") { $script:UpdateQueue = @($found | ForEach-Object { [string]$_.Name }); Start-NextUpdate }
}
function Start-NextUpdate {
    $q = @($script:UpdateQueue)
    if ($q.Count -eq 0) { return }
    $name = $q[0]; $script:UpdateQueue = @($q | Select-Object -Skip 1)
    $m = @(Load-Db) | Where-Object { $_.Name -eq $name } | Select-Object -First 1
    $src = Get-ModSource $m
    if (-not $src -or -not $src.NexusId) { Start-NextUpdate; return }
    try {
        $me = Invoke-Nexus "users/validate.json"
        if (-not $me.is_premium) {
            Open-External ("https://www.nexusmods.com/$NEXUS_GAME/mods/$($src.NexusId)?tab=files")
            $script:UpdateQueue = @()
            Set-Status "Free Nexus account: on the page that opened, click 'Mod Manager Download' (or Manual Download) - the app installs it over '$name'." $C_AMBER
            return
        }
        $fid = $(if ($src.PSObject.Properties["LatestFileId"] -and $src.LatestFileId) { [string]$src.LatestFileId } else { "" })
        $info = $null
        if (-not $fid) {
            $files = Invoke-Nexus "games/$NEXUS_GAME/mods/$($src.NexusId)/files.json"
            $info = @($files.files | Where-Object { $_.category_name -eq "MAIN" } | Sort-Object uploaded_timestamp -Descending)[0]
            $fid = [string]$info.file_id
        } else { $info = Invoke-Nexus "games/$NEXUS_GAME/mods/$($src.NexusId)/files/$fid.json" }
        $mod = Invoke-Nexus "games/$NEXUS_GAME/mods/$($src.NexusId).json"
        $links = @(Invoke-Nexus "games/$NEXUS_GAME/mods/$($src.NexusId)/files/$fid/download_link.json")
        Start-ModDownload $links[0].URI $info.file_name $name (New-NexusSource $src.NexusId $info $mod)
    } catch {
        Set-Status ("Update of '$name' failed: " + $_.Exception.Message) $C_RED
        Start-NextUpdate
    }
}

# ----------------------------------------------------------------------------
#  Share your mod list (a small file your friend opens in the app)
# ----------------------------------------------------------------------------
function Export-ModList {
    $mods = @(Load-Db)
    if ($mods.Count -eq 0) { Set-Status "You have no mods to share yet." $C_AMBER; return }
    $d = New-Object System.Windows.Forms.SaveFileDialog
    $d.Filter = "Mod list (*.lcmods)|*.lcmods"; $d.FileName = "My GTA IV mods.lcmods"
    if ($d.ShowDialog() -ne "OK") { return }
    $list = @()
    for ($i = 0; $i -lt $mods.Count; $i++) {
        $m = $mods[$i]; $src = Get-ModSource $m
        $list += [pscustomobject]@{ Name = [string]$m.Name; On = (Test-ModOn $m); Order = $i; Url = $(if ($src) { [string]$src.Url } else { "" }); NexusId = $(if ($src) { [string]$src.NexusId } else { "" }); Version = $(if ($src) { [string]$src.Version } else { "" }) }
    }
    [pscustomobject]@{ App = "Liberty City Mod Loader IV"; Made = (Get-Date).ToString("yyyy-MM-dd"); Mods = $list } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $d.FileName -Encoding UTF8
    $withLink = @($list | Where-Object { $_.Url }).Count
    Set-Status "Saved your list ($($list.Count) mods, $withLink with a download link). Send the file to your friend - they open it with Share > Open a List." $C_GREEN
}
function Import-ModList($path = $null) {
    if (-not $path) {
        $d = New-Object System.Windows.Forms.OpenFileDialog
        $d.Filter = "Mod list (*.lcmods)|*.lcmods|All files (*.*)|*.*"
        if ($d.ShowDialog() -ne "OK") { return }
        $path = $d.FileName
    }
    try { $x = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json } catch { Set-Status "That file isn't a mod list." $C_RED; return }
    $theirs = @($x.Mods | Sort-Object { [int]$_.Order })
    if ($theirs.Count -eq 0) { Set-Status "That list is empty." $C_AMBER; return }
    $mine = @(Load-Db)
    $match = {
        param($t)
        foreach ($m in $mine) {
            $src = Get-ModSource $m
            if ($t.NexusId -and $src -and [string]$src.NexusId -eq [string]$t.NexusId) { return $m }
            if ([string]$m.Name -ieq [string]$t.Name) { return $m }
        }
        return $null
    }
    $haveList = @(); $missing = @()
    foreach ($t in $theirs) { $m = & $match $t; if ($m) { $haveList += [pscustomobject]@{ Mine = $m; Theirs = $t } } else { $missing += $t } }
    $msg = "This list has $($theirs.Count) mod(s). You already have $($haveList.Count)."
    if ($missing.Count -gt 0) {
        $msg += "`n`nYou don't have:`n" + ((@($missing | Select-Object -First 12) | ForEach-Object { "- " + $_.Name + $(if ($_.Url) { "" } else { "  (no link)" }) }) -join "`n")
        if ($missing.Count -gt 12) { $msg += "`n...and $($missing.Count - 12) more" }
        $links = @($missing | Where-Object { $_.Url })
        if ($links.Count -gt 0) {
            $r = [System.Windows.Forms.MessageBox]::Show($msg + "`n`nOpen the download pages of the $($links.Count) mod(s) with a link?", "Open a Mod List", "YesNo", "Question")
            if ($r -eq "Yes") { foreach ($t in ($links | Select-Object -First 15)) { Open-External ([string]$t.Url) } }
        } else { [System.Windows.Forms.MessageBox]::Show($msg, "Open a Mod List", "OK", "Information") | Out-Null }
    }
    if ($haveList.Count -gt 0) {
        $r = [System.Windows.Forms.MessageBox]::Show("Also turn your $($haveList.Count) matching mod(s) on/off and put them in the same order as this list?", "Open a Mod List", "YesNo", "Question")
        if ($r -eq "Yes") {
            $onNames = @($haveList | Where-Object { $_.Theirs.On } | ForEach-Object { [string]$_.Mine.Name })
            $offNames = @($haveList | Where-Object { -not $_.Theirs.On } | ForEach-Object { [string]$_.Mine.Name })
            # same order: the rest of yours first, then theirs in their order (lower wins, so theirs decide)
            $mods = @(Load-Db)
            $ordered = @($haveList | ForEach-Object { [string]$_.Mine.Name })
            $newOrder = @($mods | Where-Object { $ordered -notcontains [string]$_.Name }) + @($ordered | ForEach-Object { $n = $_; $mods | Where-Object { [string]$_.Name -eq $n } | Select-Object -First 1 })
            Save-Db $newOrder
            Set-ModsState $offNames $false
            Set-ModsState $onNames $true
            $all = @(); foreach ($m in @(Load-Db)) { if ($ordered -contains [string]$m.Name) { $all += @($m.Files) } }
            if ($all.Count -gt 0) { Sync-Files $all @(Load-Db) }
            if (@(Load-Db | Where-Object { $ordered -contains [string]$_.Name -and (Test-TouchesArchive $_) }).Count -gt 0) { [void](Rebuild-Archives) }
            Set-Status "Your mods now match the list." $C_GREEN
        }
    }
    Refresh-Garage
}

# ----------------------------------------------------------------------------
#  Drag to reorder: lower in the list wins
# ----------------------------------------------------------------------------
function Move-ModOrder([string]$name, [int]$to) {
    $mods = @(Load-Db)
    $from = -1; for ($i = 0; $i -lt $mods.Count; $i++) { if ([string]$mods[$i].Name -eq $name) { $from = $i; break } }
    if ($from -lt 0) { return }
    if ($to -gt $from) { $to-- }
    $to = [math]::Max(0, [math]::Min($mods.Count - 1, $to))
    if ($to -eq $from) { return }
    $m = $mods[$from]
    $rest = New-Object System.Collections.ArrayList; for ($i = 0; $i -lt $mods.Count; $i++) { if ($i -ne $from) { [void]$rest.Add($mods[$i]) } }
    $rest.Insert($to, $m)
    $mods = @($rest)
    Save-Db $mods
    if (Test-ModOn $m) {
        Set-Status "Putting '$name' in its new place..." $C_DIM $false; try { $form.Refresh() } catch { }
        Sync-Files @($m.Files) $mods
        if (Test-TouchesArchive $m) { [void](Rebuild-Archives) }
    }
    Set-Status "'$name' moved. Lower in the list wins when two mods change the same file." $C_GREEN
}

# ----------------------------------------------------------------------------
#  Troubleshooting: play without mods, find the broken mod, read the game's logs
# ----------------------------------------------------------------------------
# turns many mods on/off at once, with no questions (their order in the list stays the same)
function Set-ModsState($names, [bool]$on) {
    $names = @($names | Where-Object { $_ })
    if ($names.Count -eq 0) { return }
    Convert-ToLibrary
    $mods = @(Load-Db)
    $rels = @(); $arc = $false
    foreach ($m in $mods) {
        if (@($names) -notcontains [string]$m.Name) { continue }
        if ((Test-ModOn $m) -eq $on) { continue }
        $m | Add-Member -NotePropertyName Enabled -NotePropertyValue $on -Force
        $rels += @($m.Files)
        if (Test-TouchesArchive $m) { $arc = $true }
    }
    if ($rels.Count -eq 0) { return }
    Save-Db $mods
    Sync-Files $rels $mods
    if ($arc) { [void](Rebuild-Archives) }
}
function Test-KeepOn($m) {   # Fusion Fix stays on while testing
    return ([string]$m.Name -match '(?i)fusion\s*fix' -or @($m.Files) -contains "plugins\GTAIV.EFLC.FusionFix.asi")
}
function Get-TsPath { return (Join-Path (Get-DataDir) "troubleshoot.json") }
function Load-Ts { $p = Get-TsPath; if (Test-Path -LiteralPath $p) { try { return (Get-Content -LiteralPath $p -Raw | ConvertFrom-Json) } catch { } }; return $null }
function Save-Ts($st) { if ($null -eq $st) { Remove-Item -LiteralPath (Get-TsPath) -Force -ErrorAction SilentlyContinue } else { $st | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Get-TsPath) -Encoding UTF8 } }
function Get-OnModNames { return @(@(Load-Db) | Where-Object { (Test-ModOn $_) -and -not (Test-KeepOn $_) } | ForEach-Object { [string]$_.Name }) }

function Start-NoMods {
    if (Load-Ts) { return }
    $before = @(Get-OnModNames)
    if ($before.Count -eq 0) { Set-Status "All your mods are already off." $C_DIM; return }
    Set-Status "Turning your mods off..." $C_DIM $false; try { $form.Refresh() } catch { }
    Save-Ts ([pscustomobject]@{ Mode = "nomods"; Before = $before })
    Set-ModsState $before $false
    Set-Status "$($before.Count) mod(s) are off (Fusion Fix stays on). Play the game - press 'Turn My Mods Back On' when you're done." $C_GREEN
}
function Stop-Troubleshoot([bool]$quiet = $false) {
    $st = Load-Ts
    if (-not $st) { return }
    Set-Status "Turning your mods back on..." $C_DIM $false; try { $form.Refresh() } catch { }
    $before = @($st.Before)
    $mods = @(Load-Db)
    Set-ModsState @($mods | Where-Object { $before -contains [string]$_.Name } | ForEach-Object { [string]$_.Name }) $true
    Save-Ts $null
    if (-not $quiet) { Set-Status "Your mods are back on, just like before." $C_GREEN }
}
# Find the broken mod: first everything off (is it a mod at all?), then half and half until one is left
function Start-FindBroken {
    if (Load-Ts) { Stop-Troubleshoot $true }
    $before = @(Get-OnModNames)
    if ($before.Count -eq 0) { Set-Status "You have no mods on to test." $C_AMBER; return }
    $st = [pscustomobject]@{ Mode = "find"; Before = $before; Suspects = $before; TestOff = $before; Step = 0 }
    Save-Ts $st
    Set-ModsState $before $false
}
function Set-FindStep($st) {
    $n = @($st.Suspects).Count
    $half = @($st.Suspects | Select-Object -First ([math]::Ceiling($n / 2)))
    $st.TestOff = $half
    $st.Step = [int]$st.Step + 1
    Save-Ts $st
    $mods = @(Load-Db)
    $on = @($st.Before | Where-Object { $half -notcontains $_ })
    Set-ModsState @($half) $false
    Set-ModsState $on $true
}
# $still = the problem is still there with the test mods off
function Answer-FindBroken([bool]$still) {
    $st = Load-Ts
    if (-not $st -or $st.Mode -ne "find") { return }
    if ([int]$st.Step -eq 0) {
        if ($still) {
            Stop-Troubleshoot $true
            [System.Windows.Forms.MessageBox]::Show("The problem happens even with all your mods off, so it's not one of your mods.`n`nIt could be Fusion Fix, a mod this app doesn't know about, or the game itself.`n`nYour mods are back on.", "Find the Broken Mod", "OK", "Information") | Out-Null
            return
        }
        $st.Suspects = @($st.Before)
    } else {
        if ($still) { $st.Suspects = @($st.Suspects | Where-Object { @($st.TestOff) -notcontains $_ }) }
        else { $st.Suspects = @($st.TestOff) }
    }
    if (@($st.Suspects).Count -le 1) {
        $bad = @($st.Suspects)[0]
        Stop-Troubleshoot $true
        $r = [System.Windows.Forms.MessageBox]::Show("Found it: '$bad' causes the problem.`n`nAll your other mods are back on. Turn '$bad' off now?", "Find the Broken Mod", "YesNo", "Information")
        if ($r -eq "Yes") { Disable-Mod $bad }
        try { Refresh-Garage } catch { }
        Set-Status "The broken mod is '$bad'." $C_GREEN
        return
    }
    Set-FindStep $st
}

# the game's log files, read in simple words
function Get-LogExplain([string]$l) {
    if ($l -match "(?i)could not load (file or )?assembly\s+'?([^',\s]+)") { return "Needs '" + $matches[2] + "', which is missing or the wrong version. Reinstall the mod or get what its readme asks for." }
    if ($l -match '(?i)MissingMethod|MissingField|TypeLoad|EntryPointNotFound|BadImageFormat') { return "Made for a different version of ScriptHookDotNet (or another helper). Get the version the mod asks for." }
    if ($l -match '(?i)UnauthorizedAccess|access (is )?denied|permission') { return "Windows blocked a file. Right-click the mod's file > Properties > Unblock, then try again." }
    if ($l -match '(?i)version' -and $l -match '(?i)unsupported|incompatible|not supported|wrong|mismatch') { return "Doesn't work with your game version." }
    if ($l -match '(?i)not found|missing|could not find|cannot find|can.t find|is not there') { return "A file it needs is missing. Install the mod again (all its files)." }
    if ($l -match '(?i)NullReference|IndexOutOfRange|InvalidOperation|Argument\w*Exception|DivideByZero|StackOverflow|OutOfMemory') { return "The script crashed - a bug in the mod. Try its newest version, or turn it off." }
    if ($l -match '(?i)fail\w* to (load|start|initiali[sz]e)|error during startup|could not (load|start)|couldn.t (load|start)|did not start|could not start') { return "It couldn't start." }
    if ($l -match '(?i)time(d)? ?out') { return "It took too long and was stopped." }
    if ($l -match '(?i)exception') { return "The script crashed - a bug in the mod. Try its newest version, or turn it off." }
    return "Reported a problem."
}
function Get-LogOwner([string]$line, [string]$logName, $mods) {
    foreach ($m in [regex]::Matches($line, '(?i)[\w\.\-]+\.(net\.dll|dll|asi|cs|vb)\b')) {
        $leaf = Split-Path $m.Value -Leaf
        foreach ($mm in $mods) { if (@($mm.Files | Where-Object { (Split-Path ([string]$_) -Leaf) -ieq $leaf }).Count -gt 0) { return [string]$mm.Name } }
        return $leaf
    }
    # "script 'LibertyCityCustoms.Scripts.LibertyCityCustoms'" -> the mod with a file of that name
    $sm = [regex]::Match($line, "(?i)script\s+'([^']+)'")
    if ($sm.Success) {
        $parts = @($sm.Groups[1].Value.Split('.') | Where-Object { $_ })
        foreach ($pn in @($parts[0], $parts[-1])) {
            foreach ($mm in $mods) { if (@($mm.Files | Where-Object { ([IO.Path]::GetFileName([string]$_) -replace '(?i)\.(net\.dll|dll|cs|vb|ini)$', '') -ieq $pn }).Count -gt 0) { return [string]$mm.Name } }
        }
        return $parts[-1]
    }
    $stem = ([IO.Path]::GetFileNameWithoutExtension($logName) -replace '(?i)[-_ ]?(did[-_ ]?not[-_ ]?start|warnings?|errors?|log|crash)$', '')
    if ($stem) {
        foreach ($mm in $mods) { if ([string]$mm.Name -ieq $stem -or @($mm.Files | Where-Object { [IO.Path]::GetFileNameWithoutExtension((Split-Path ([string]$_) -Leaf)) -ieq $stem }).Count -gt 0) { return [string]$mm.Name } }
        return $stem
    }
    return $logName
}
function Get-LogFindings($since = $null) {
    $out = New-Object System.Collections.ArrayList
    $g = $script:Game
    if (-not $g) { return $out }
    $files = @()
    $files += @(Get-ChildItem -LiteralPath $g -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -ieq ".log" -or ($_.Extension -ieq ".txt" -and $_.Name -match '(?i)not.?start|warning|error|crash') })
    foreach ($d in @(Get-ChildItem -LiteralPath $g -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch '(?i)^(LCModInstaller|update|pc|common|tlad|tbogt|movies|redistributables|manuals)$' })) {
        $files += @(Get-ChildItem -LiteralPath $d.FullName -File -Recurse -Depth 1 -ErrorAction SilentlyContinue | Where-Object { $_.Extension -ieq ".log" })
    }
    $mods = @(Load-Db)
    $cut = (Get-Date).AddDays(-7)
    $seen = @{}
    foreach ($f in ($files | Sort-Object LastWriteTime -Descending)) {
        if ($f.LastWriteTime -lt $cut -or $f.Length -eq 0) { continue }
        if ($since -and $f.LastWriteTime -lt $since) { continue }
        $lines = @()
        try {
            if ($f.Length -gt 5MB) { $lines = @(Get-Content -LiteralPath $f.FullName -Tail 400 -ErrorAction Stop) }
            else { $lines = @([IO.File]::ReadAllLines($f.FullName)) }
        } catch { continue }
        $when = $f.LastWriteTime.ToString("d MMM HH:mm")
        $hits = @()
        if ($f.Extension -ieq ".txt") {
            # a report a mod writes when something went wrong: its first line, the reason, and its "- " points
            $first = @($lines | Where-Object { $_.Trim() } | Select-Object -First 1)
            if ($first) { $hits += $first[0] }
            for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i].Trim() -match '^(WHY|REASON|CAUSE)S?:?$') { $nx = @($lines[($i + 1)..([math]::Min($lines.Count - 1, $i + 4))] | Where-Object { $_.Trim() } | Select-Object -First 1); if ($nx) { $hits += $nx[0] } } }
            $hits += @($lines | Where-Object { $_ -match '^\s*-\s+\S' } | Select-Object -First 4)
        } else {
            $dx = $f.Name -match '(?i)d3d9|dxvk|dxgi|d3d11'
            foreach ($l in $lines) {
                if ($dx) { if ($l -match '^err:') { $hits += $l }; continue }
                if ($l -match '(?i)\berror\b|exception|\bfail|could not|couldn.t|cannot|can.t |not found|missing|unable to|\[err' -and $l -notmatch '(?i)\bno errors?\b|\b0 errors?\b|not available|errorlevel') { $hits += $l }
            }
        }
        foreach ($h in $hits) {
            $t = ([string]$h).Trim() -replace '^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d\s*-?\s*', ''
            if (-not $t) { continue }
            $who = $(if ($f.Extension -ieq ".txt") { Get-LogOwner "" $f.Name $mods } else { Get-LogOwner $t $f.Name $mods })
            $what = $(if ($f.Extension -ieq ".txt") { $(if ($t.Length -gt 200) { $t.Substring(0, 197) + "..." } else { $t }) } else { Get-LogExplain $t })
            $k = ($who + "|" + $what).ToLower()
            if ($seen.ContainsKey($k)) { continue }
            $seen[$k] = $true
            if ($t.Length -gt 180) { $t = $t.Substring(0, 177) + "..." }
            [void]$out.Add([pscustomobject]@{ Mod = $who; What = $what; Where = ($f.Name + " (" + $when + "):  " + $t) })
            if ($out.Count -ge 60) { return $out }
        }
    }
    return $out
}
function Show-LogFindings($list = $null) {
    $lvLcpd.Items.Clear()
    $lblLcpdHead.Text = $(if ($null -ne $list) { "Game logs - problems from the game you just closed" } else { "Game logs - problems from the last 7 days, newest first" })
    if ($null -eq $list) { $list = @(Get-LogFindings) } else { $list = @($list) }
    foreach ($x in $list) {
        $it = New-Object System.Windows.Forms.ListViewItem([string]$x.Mod)
        [void]$it.SubItems.Add([string]$x.What); [void]$it.SubItems.Add([string]$x.Where)
        $it.ForeColor = $C_AMBER
        [void]$lvLcpd.Items.Add($it)
    }
    if ($list.Count -eq 0) {
        $it = New-Object System.Windows.Forms.ListViewItem("All good")
        [void]$it.SubItems.Add("No errors in the game's logs from the last 7 days"); [void]$it.SubItems.Add("Play the game first, then read the logs again")
        $it.ForeColor = $C_GREEN
        [void]$lvLcpd.Items.Add($it)
        Set-Status "The game's logs show no problems." $C_GREEN
    } else { Set-Status "$($list.Count) problem(s) found in the game's logs - see the list." $C_AMBER }
}


# ----------------------------------------------------------------------------
#  LCPD check: files replaced twice, and mods known to fight each other
# ----------------------------------------------------------------------------
function Run-LcpdCheck {
    $lvLcpd.Items.Clear()
    try { $lblLcpdHead.Text = "LCPD Records - conflicts between your mods" } catch { }
    if (-not $script:Game) { return }
    $found = 0
    $seen = @{}
    $upd = Join-Path $script:Game "update"
    if (Test-Path $upd) {
        foreach ($f in Get-ChildItem $upd -Recurse -File -ErrorAction SilentlyContinue) {
            $rel = $f.FullName.Substring($script:Game.Length).TrimStart("\")
            $gp = Get-GamePath $rel
            if ($seen.ContainsKey($gp)) { $seen[$gp] += , $rel } else { $seen[$gp] = @($rel) }
        }
        foreach ($k in $seen.Keys) {
            if ($seen[$k].Count -gt 1) {
                $it = New-Object System.Windows.Forms.ListViewItem("Same file twice")
                [void]$it.SubItems.Add($k)
                [void]$it.SubItems.Add(($seen[$k] -join "   |   "))
                $it.ForeColor = $C_AMBER
                [void]$lvLcpd.Items.Add($it); $found++
            }
        }
    }
    $scripts = Join-Path $script:Game "scripts"
    $pairs = @(
        @("dsound.dll", "dinput8.dll", "Old ASI loader next to Fusion Fix's loader")
    )
    foreach ($p in $pairs) {
        if ((Test-Path (Join-Path $script:Game $p[0])) -and (Test-Path (Join-Path $script:Game $p[1]))) {
            $it = New-Object System.Windows.Forms.ListViewItem("Mods clash")
            [void]$it.SubItems.Add($p[2])
            [void]$it.SubItems.Add($p[0] + "   |   " + $p[1])
            $it.ForeColor = $C_RED
            [void]$lvLcpd.Items.Add($it); $found++
        }
    }
    if ($found -eq 0) {
        $it = New-Object System.Windows.Forms.ListViewItem("Clean record")
        [void]$it.SubItems.Add("No conflicts found")
        [void]$it.SubItems.Add("")
        $it.ForeColor = $C_GREEN
        [void]$lvLcpd.Items.Add($it)
        Set-Status "LCPD: Clean record. No conflicts on file." $C_GREEN
    } else { Set-Status "LCPD found $found problem(s). See the conflict list on My Mods." $C_AMBER }
}

# ----------------------------------------------------------------------------
#  Right-click menu
# ----------------------------------------------------------------------------
$MENU_KEYS = @(".zip", ".rar", ".7z", ".oiv") | ForEach-Object { "HKCU:\Software\Classes\SystemFileAssociations\$_\shell\LCModInstaller" }
function Get-LaunchCommand {
    if ($env:LCMI_EXE -and (Test-Path $env:LCMI_EXE)) { return "`"$env:LCMI_EXE`" `"%1`"" }
    return "powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File `"$(Join-Path $APP_DIR 'Liberty City Mod Loader IV.ps1')`" `"%1`""
}
function Add-ContextMenu {
    $cmd = Get-LaunchCommand
    foreach ($k in $MENU_KEYS) {
        New-Item -Path "$k\command" -Force | Out-Null
        Set-ItemProperty -Path $k -Name "(default)" -Value "Install with Liberty City Mod Loader IV"
        Set-ItemProperty -Path "$k\command" -Name "(default)" -Value $cmd
    }
    Set-Status "Right-click any mod archive and choose 'Install with Liberty City Mod Loader IV'." $C_GREEN
}
# the app was renamed (Mod Installer -> Mod Loader IV): old right-click / Nexus entries are pointed at the new name once
function Update-OldLaunchers {
    try {
        $cmd = Get-LaunchCommand
        foreach ($k in $MENU_KEYS) {
            if (-not (Test-Path "$k\command")) { continue }
            $cur = (Get-ItemProperty "$k\command" -ErrorAction Stop)."(default)"
            if ($cur -match "Liberty City Mod Installer") { Set-ItemProperty -Path $k -Name "(default)" -Value "Install with Liberty City Mod Loader IV"; Set-ItemProperty -Path "$k\command" -Name "(default)" -Value $cmd }
        }
        $nk = "HKCU:\Software\Classes\nxm\shell\open\command"
        if (Test-Path $nk) { $cur = (Get-ItemProperty $nk -ErrorAction Stop)."(default)"; if ($cur -match "Liberty City Mod Installer") { Set-ItemProperty -Path $nk -Name "(default)" -Value $cmd } }
    } catch { }
}
function Remove-ContextMenu {
    foreach ($k in $MENU_KEYS) { if (Test-Path $k) { Remove-Item $k -Recurse -Force } }
    Set-Status "Right-click menu entry removed." $C_DIM
}

# ----------------------------------------------------------------------------
#  Online: LibertyCity and Nexus Mods (the TW@ Internet Cafe)
# ----------------------------------------------------------------------------
$NEXUS_GAME = "gta4"
$APP_HEADERS = @{ "Application-Name" = "LibertyCityModInstaller"; "Application-Version" = "1.1" }
$script:Settings = $null
$script:Watcher = $null
$script:WebClient = $null
$script:Offered = @{}

function Get-SettingsPath { return Join-Path (Get-DataDir) "settings.json" }
function Load-Settings {
    $s = [pscustomobject]@{ NexusKey = ""; WatchDownloads = $true; OldNxm = "" }
    if ($script:Game -and (Test-Path (Get-SettingsPath))) {
        try {
            $x = Get-Content (Get-SettingsPath) -Raw | ConvertFrom-Json
            if ($x.NexusKey) { $s.NexusKey = $x.NexusKey }
            if ($null -ne $x.WatchDownloads) { $s.WatchDownloads = [bool]$x.WatchDownloads }
            if ($x.OldNxm) { $s.OldNxm = $x.OldNxm }
        } catch { }
    }
    $script:Settings = $s
}
function Save-Settings { if ($script:Game) { $script:Settings | ConvertTo-Json | Set-Content (Get-SettingsPath) -Encoding UTF8 } }

# the API key is stored encrypted with your Windows account (only you, on this PC, can read it)
function Set-NexusKey($plain) {
    if (-not $plain) { $script:Settings.NexusKey = ""; Save-Settings; return }
    $sec = ConvertTo-SecureString $plain -AsPlainText -Force
    $script:Settings.NexusKey = ConvertFrom-SecureString $sec
    Save-Settings
}
function Get-NexusKey {
    if (-not $script:Settings -or -not $script:Settings.NexusKey) { return "" }
    try {
        $sec = ConvertTo-SecureString $script:Settings.NexusKey
        $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
        try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
    } catch { return "" }
}

function Invoke-Nexus($path) {
    $key = Get-NexusKey
    if (-not $key) { throw "Add your Nexus API key on the TW@ Internet Cafe page first." }
    $h = @{ "apikey" = $key; "Accept" = "application/json" } + $APP_HEADERS
    return Invoke-RestMethod -Uri ("https://api.nexusmods.com/v1/" + $path) -Headers $h -UseBasicParsing
}

function Get-DownloadsFolder {
    try {
        $v = (Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders" -ErrorAction Stop)."{374DE290-123F-4565-9164-39C4925E467B}"
        if ($v) { return [Environment]::ExpandEnvironmentVariables($v) }
    } catch { }
    return Join-Path $env:USERPROFILE "Downloads"
}

# download without freezing the window, then open the file in the Port of Liberty
# progress text at most 4 times a second (updating on every chunk slows the app down), with speed
function Reset-DlProgress { $script:DlStart = [Environment]::TickCount; $script:DlLast = $script:DlStart - 1000; $script:DlLastBytes = 0; $script:DlLastTick = $script:DlStart; $script:DlSpeed = 0 }
function Show-DlProgress([long]$got, [long]$total, [string]$name) {
    $now = [Environment]::TickCount
    if ($now - $script:DlLast -lt 250) { return }
    $script:DlLast = $now
    $dt = ($now - $script:DlLastTick) / 1000.0
    if ($dt -ge 1) { $script:DlSpeed = ($got - $script:DlLastBytes) / 1MB / $dt; $script:DlLastBytes = $got; $script:DlLastTick = $now }
    $mb = [math]::Round($got / 1MB, 1)
    $pct = $(if ($total -gt 0) { [string][math]::Round(100 * $got / $total) + "%   " } else { "" })
    $of = $(if ($total -gt 0) { " of " + [math]::Round($total / 1MB, 1) } else { "" })
    $spd = $(if ($script:DlSpeed -gt 0) { "   -   " + [math]::Round($script:DlSpeed, 2) + " MB/s" } else { "" })
    Set-Status ("Downloading " + $name + "   " + $pct + $mb + $of + " MB" + $spd) $C_TEXT $false
}
function Start-ModDownload($url, $fileName, $modName, $source = $null) {
    if ($script:WebClient) { Set-Status "Another shipment is still on its way. Wait for it to finish." $C_AMBER; return }
    $dir = Join-Path (Get-DataDir) "downloads"
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory $dir | Out-Null }
    if (-not $fileName) { $fileName = "mod_" + (Get-Date).ToString("yyyyMMdd_HHmmss") + ".zip" }
    $fileName = ($fileName -replace '[\\/:*?"<>|]', "_")
    $script:DownloadDest = Join-Path $dir $fileName
    $script:DownloadName = $modName
    $script:DownloadSource = $(if ($source) { $source } else { [pscustomobject]@{ Site = "Web"; Url = [string]$url } })
    $wc = New-Object System.Net.WebClient
    $wc.Headers.Add("User-Agent", "LibertyCityModInstaller/1.1")
    $script:WebClient = $wc
    Reset-DlProgress
    $wc.Add_DownloadProgressChanged({ Show-DlProgress $_.BytesReceived $_.TotalBytesToReceive ([IO.Path]::GetFileName($script:DownloadDest)) })
    $wc.Add_DownloadFileCompleted({
        $err = $_.Error
        $script:WebClient.Dispose(); $script:WebClient = $null
        if ($err) { Set-Status ("Download failed: " + $err.Message) $C_RED; return }
        Show-Page $PG_INSTALL
        Load-Mod $script:DownloadDest
        if ($script:DownloadName) { $txtMod.Text = Clean-Name $script:DownloadName }
        $src = $script:DownloadSource; $script:DownloadSource = $null
        if ($src) {
            $script:PlanSource = $src
            # a newer version of a mod you have: keep its name, so it replaces the old one
            if ($src.NexusId) {
                $have = @(Load-Db) | Where-Object { $_.PSObject.Properties["Source"] -and $_.Source -and [string]$_.Source.NexusId -eq [string]$src.NexusId } | Select-Object -First 1
                if ($have) { $txtMod.Text = [string]$have.Name; $script:PlanMod = [string]$have.Name }
            }
        }
    })
    Set-Status "Shipment ordered. Downloading..." $C_DIM
    $wc.DownloadFileAsync([Uri]$url, $script:DownloadDest)
}

# where a mod came from (kept with the mod: for updates, sharing and its picture)
function New-NexusSource($modId, $file, $mod) {
    return [pscustomobject]@{ Site = "Nexus"; NexusId = [string]$modId; FileId = $(if ($file) { [string]$file.file_id } else { "" }); Version = $(if ($file -and $file.version) { [string]$file.version } elseif ($mod) { [string]$mod.version } else { "" }); Uploaded = $(if ($file) { [long]$file.uploaded_timestamp } else { 0 }); Url = "https://www.nexusmods.com/$NEXUS_GAME/mods/$modId"; Picture = $(if ($mod) { [string]$mod.picture_url } else { "" }) }
}
# Nexus file names carry the mod number and version: "Name-1350-1-2-1727200000.zip" or "Name_1350_1_2026-09-24T20-48Z_X.zip"
function Get-NexusFromName([string]$fileName) {
    $st = [IO.Path]::GetFileNameWithoutExtension($fileName)
    $m = [regex]::Match($st, '^(.+?)-(\d{1,6})-(\d+(?:-\d+)*)-(\d{9,11})$')
    if (-not $m.Success) { $m = [regex]::Match($st, '^(.+?)_(\d{1,6})_(\d+(?:_\d+)*)_(\d{4}-\d\d-\d\dT[\d-]+Z)(?:_\w+)?$') }
    if (-not $m.Success) { return $null }
    return [pscustomobject]@{ Name = $m.Groups[1].Value.Trim(" -_".ToCharArray()); Source = [pscustomobject]@{ Site = "Nexus"; NexusId = $m.Groups[2].Value; FileId = ""; Version = ($m.Groups[3].Value -replace '[-_]', '.'); Uploaded = 0; Url = "https://www.nexusmods.com/$NEXUS_GAME/mods/" + $m.Groups[2].Value; Picture = "" } }
}
function Get-ModSource($m) { if ($m -and $m.PSObject.Properties["Source"] -and $m.Source) { return $m.Source }; return $null }

# nxm://gta4/mods/123/files/456?key=...&expires=...&user_id=...
function Handle-Nxm($link) {
    $m = [regex]::Match($link, '^nxm://([^/]+)/mods/(\d+)/files/(\d+)\?(.*)$', "IgnoreCase")
    if (-not $m.Success) { Set-Status "That Nexus link doesn't look right." $C_RED; return }
    $nxGame = $m.Groups[1].Value; $modId = $m.Groups[2].Value; $fileId = $m.Groups[3].Value
    if ($nxGame -ine $NEXUS_GAME) { Set-Status "That link is for another game ($nxGame), not GTA IV." $C_RED; return }
    $q = @{}
    foreach ($pair in $m.Groups[4].Value.Split("&")) { $kv = $pair.Split("=", 2); if ($kv.Length -eq 2) { $q[$kv[0]] = $kv[1] } }
    try {
        Set-Status "Calling Nexus from the TW@ Cafe..." $C_DIM
        $info = Invoke-Nexus "games/$NEXUS_GAME/mods/$modId/files/$fileId.json"
        $mod = Invoke-Nexus "games/$NEXUS_GAME/mods/$modId.json"
        $path = "games/$NEXUS_GAME/mods/$modId/files/$fileId/download_link.json"
        if ($q["key"]) { $path += "?key=" + $q["key"] + "&expires=" + $q["expires"] }
        $links = @(Invoke-Nexus $path)
        if ($links.Count -eq 0) { throw "Nexus gave no download link." }
        Start-ModDownload $links[0].URI $info.file_name $mod.name (New-NexusSource $modId $info $mod)
    } catch {
        Set-Status ("Nexus: " + $_.Exception.Message) $C_RED
    }
}

# a Nexus mod page: Premium downloads straight away, free accounts are sent to the Files tab
function Handle-NexusPage($url) {
    $m = [regex]::Match($url, 'nexusmods\.com/(?:games/)?([^/?#]+)/mods/(\d+)', "IgnoreCase")
    if (-not $m.Success) { Set-Status "That doesn't look like a Nexus mod page." $C_RED; return }
    $modId = $m.Groups[2].Value
    $filesPage = "https://www.nexusmods.com/$NEXUS_GAME/mods/$modId" + "?tab=files"
    try {
        $me = Invoke-Nexus "users/validate.json"
        if (-not $me.is_premium) {
            Open-Browser $filesPage
            Set-Status "Free Nexus account: log in and click Manual Download on the Files tab." $C_AMBER
            return
        }
        $files = Invoke-Nexus "games/$NEXUS_GAME/mods/$modId/files.json"
        $main = @($files.files | Where-Object { $_.category_name -eq "MAIN" } | Sort-Object uploaded_timestamp -Descending)
        if ($main.Count -eq 0) { $main = @($files.files | Where-Object { $_.category_name -ne "OLD_VERSION" -and $_.category_name -ne "ARCHIVED" } | Sort-Object uploaded_timestamp -Descending) }
        if ($main.Count -eq 0) { throw "This mod has no files to download." }
        if ($main.Count -gt 1) { Set-Status "This mod has several main files - taking the newest. Use Mod Manager Download on Nexus to pick another." $C_AMBER }
        $mod = Invoke-Nexus "games/$NEXUS_GAME/mods/$modId.json"
        $links = @(Invoke-Nexus "games/$NEXUS_GAME/mods/$modId/files/$($main[0].file_id)/download_link.json")
        Start-ModDownload $links[0].URI $main[0].file_name $mod.name (New-NexusSource $modId $main[0] $mod)
    } catch {
        Open-Browser $filesPage
        Set-Status ("Nexus: " + $_.Exception.Message + " Opened the Files tab instead.") $C_AMBER
    }
}

# the address bar: any website, an nxm:// link or a direct file link
function Handle-Link($url) {
    $url = $url.Trim()
    if (-not $url) { return }
    if ($url -match '^nxm://') { Handle-Nxm $url; return }
    if ($url -match '^https?://.+\.(zip|rar|7z|oiv)(\?.*)?$') {
        Start-ModDownload $url ([IO.Path]::GetFileName(([Uri]$url).AbsolutePath)) ""
        return
    }
    if ($url -match 'nexusmods\.com/.+/mods/\d+' -and (Get-NexusKey)) { Handle-NexusPage $url; return }
    Open-Browser $url
}

# watch the Downloads folder and offer new mod archives
function Set-Watch([bool]$on) {
    if ($script:Watcher) { $script:Watcher.EnableRaisingEvents = $false; $script:Watcher.Dispose(); $script:Watcher = $null }
    if ($script:Settings) { $script:Settings.WatchDownloads = $on; Save-Settings }
    if (-not $on) { return }
    $dir = Get-DownloadsFolder
    if (-not (Test-Path $dir)) { Set-Status "Couldn't find your Downloads folder." $C_RED; return }
    $w = New-Object System.IO.FileSystemWatcher $dir
    $w.IncludeSubdirectories = $false
    $w.SynchronizingObject = $form
    $w.Add_Created({ Offer-Download $_.FullPath })
    $w.Add_Renamed({ Offer-Download $_.FullPath })
    $w.Add_Changed({ Offer-Download $_.FullPath })
    $w.EnableRaisingEvents = $true
    $script:Watcher = $w
}

function Offer-Download($path) {
    if ($path -notmatch '\.(zip|rar|7z|oiv)$') { return }
    if ($script:Offered.ContainsKey($path)) { return }
    # only once the browser has finished writing it (a later event will try again)
    try {
        if ((Get-Item $path -ErrorAction Stop).Length -eq 0) { return }
        $fs = [IO.File]::Open($path, "Open", "Read", "None"); $fs.Close()
    } catch { return }
    $script:Offered[$path] = $true
    $name = [IO.Path]::GetFileName($path)
    $form.Activate()
    $r = [System.Windows.Forms.MessageBox]::Show("A new shipment just landed in your Downloads:`n`n$name`n`nOpen it in the Port of Liberty?", "TW@ Internet Cafe", "YesNo", "Question")
    if ($r -eq "Yes") { Show-Page $PG_INSTALL; Load-Mod $path }
}

# become the handler for Nexus "Mod Manager Download" buttons
function Test-NxmRegistered {
    try { return ((Get-ItemProperty "HKCU:\Software\Classes\nxm\shell\open\command" -ErrorAction Stop)."(default)" -match "Liberty City Mod Loader IV") } catch { return $false }
}
function Register-Nxm {
    $k = "HKCU:\Software\Classes\nxm"
    try {
        $old = (Get-ItemProperty "$k\shell\open\command" -ErrorAction Stop)."(default)"
        if ($old -and $old -notmatch "Liberty City Mod Loader IV") { $script:Settings.OldNxm = $old; Save-Settings }
    } catch { }
    $cmd = Get-LaunchCommand
    New-Item -Path "$k\shell\open\command" -Force | Out-Null
    Set-ItemProperty -Path $k -Name "(default)" -Value "URL:NXM Protocol"
    Set-ItemProperty -Path $k -Name "URL Protocol" -Value ""
    Set-ItemProperty -Path "$k\shell\open\command" -Name "(default)" -Value $cmd
    Set-Status "Nexus 'Mod Manager Download' buttons now open in Liberty City Mod Loader IV." $C_GREEN
}
function Unregister-Nxm {
    if ($script:Settings.OldNxm) {
        Set-ItemProperty -Path "HKCU:\Software\Classes\nxm\shell\open\command" -Name "(default)" -Value $script:Settings.OldNxm
        Set-Status "Nexus downloads handed back to your previous mod manager." $C_DIM
    } elseif (Test-Path "HKCU:\Software\Classes\nxm") {
        Remove-Item "HKCU:\Software\Classes\nxm" -Recurse -Force
        Set-Status "Stopped handling Nexus download buttons." $C_DIM
    }
}

# ----------------------------------------------------------------------------
#  Built-in browser (Microsoft WebView2) - works with any mod website
# ----------------------------------------------------------------------------
$WV2_VERSION = "1.0.2903.40"
$script:WV2Ready = $false
$script:Web = $null

function Test-WebView2Runtime {
    foreach ($k in @("HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
                     "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
                     "HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}")) {
        try { $v = (Get-ItemProperty $k -ErrorAction Stop).pv; if ($v -and $v -ne "0.0.0.0") { return $true } } catch { }
    }
    return $false
}

# one-time download of Microsoft's WebView2 SDK (about 2 MB) from NuGet, Microsoft's official package site
function Ensure-WebView2 {
    if ($script:WV2Ready) { return $true }
    if (-not (Test-WebView2Runtime)) {
        $r = [System.Windows.Forms.MessageBox]::Show("The built-in browser needs Microsoft Edge WebView2 Runtime, which isn't installed.`n`nOpen Microsoft's download page now? (Until then, sites open in your normal browser.)", "Liberty City Mod Loader IV", "YesNo", "Information")
        if ($r -eq "Yes") { Start-Process "https://developer.microsoft.com/microsoft-edge/webview2/" }
        return $false
    }
    $dir = Join-Path (Get-DataDir) "webview2"
    $core = Join-Path $dir "Microsoft.Web.WebView2.Core.dll"
    $winf = Join-Path $dir "Microsoft.Web.WebView2.WinForms.dll"
    try {
        if (-not (Test-Path $core) -or -not (Test-Path $winf)) {
            Set-Status "Setting up the built-in browser (one-time download from Microsoft)..." $C_DIM $false
            $form.Refresh()
            if (-not (Test-Path $dir)) { New-Item -ItemType Directory $dir | Out-Null }
            $pkg = Join-Path $dir "webview2.nupkg"
            Invoke-WebRequest -Uri "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$WV2_VERSION" -OutFile $pkg -UseBasicParsing
            $zip = [System.IO.Compression.ZipFile]::OpenRead($pkg)
            try {
                foreach ($e in $zip.Entries) {
                    $n = $e.FullName; $out = $null
                    if ($n -match '^lib/net4[0-9]*/(Microsoft\.Web\.WebView2\.(Core|WinForms)\.dll)$') { $out = Join-Path $dir $Matches[1] }
                    elseif ($n -eq "runtimes/win-x64/native/WebView2Loader.dll") { $out = Join-Path $dir "x64\WebView2Loader.dll" }
                    elseif ($n -eq "runtimes/win-x86/native/WebView2Loader.dll") { $out = Join-Path $dir "x86\WebView2Loader.dll" }
                    if ($out) {
                        $od = Split-Path $out -Parent
                        if (-not (Test-Path $od)) { New-Item -ItemType Directory $od | Out-Null }
                        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, $out, $true)
                    }
                }
            } finally { $zip.Dispose() }
            Remove-Item $pkg -Force -ErrorAction SilentlyContinue
        }
        $loaderDir = Join-Path $dir $(if ([Environment]::Is64BitProcess) { "x64" } else { "x86" })
        $env:PATH = $loaderDir + ";" + $env:PATH
        Add-Type -Path $core
        Add-Type -Path $winf
        try { [Microsoft.Web.WebView2.Core.CoreWebView2Environment]::SetLoaderDllFolderPath($loaderDir) } catch { }
        $script:WV2Ready = $true
        return $true
    } catch {
        Set-Status ("Couldn't set up the built-in browser: " + $_.Exception.Message) $C_AMBER
        return $false
    }
}

function Get-ModNameFromTitle($title) {
    if (-not $title) { return "" }
    $t = $title -replace '\s+at Grand Theft Auto IV Nexus.*$', '' -replace '\s+for GTA 4\s*$', '' -replace '\s*[-|:]\s*(LibertyCity|GTAinside|ModDB|GTAForums|GTA4-Mods).*$', '' -replace '^GTA 4\s+', ''
    return Clean-Name $t
}

$ARCHIVE_MIME = @{
    "application/zip" = ".zip"; "application/x-zip-compressed" = ".zip"; "application/x-zip" = ".zip"
    "application/x-rar-compressed" = ".rar"; "application/vnd.rar" = ".rar"; "application/x-rar" = ".rar"
    "application/x-7z-compressed" = ".7z"
}

function Init-Web {
    if ($script:Web) { return $true }
    if (-not (Ensure-WebView2)) { return $false }
    try {
        $wv = New-Object Microsoft.Web.WebView2.WinForms.WebView2
        $wv.Dock = "Fill"
        $props = New-Object Microsoft.Web.WebView2.WinForms.CoreWebView2CreationProperties
        $props.UserDataFolder = Join-Path (Get-DataDir) "webview2\profile"   # remembers your logins
        $wv.CreationProperties = $props
        $webHost.Controls.Add($wv)
        $script:Web = $wv
    } catch {
        Set-Status ("Couldn't start the built-in browser: " + $_.Exception.Message) $C_AMBER
        return $false
    }

    $wv.Add_CoreWebView2InitializationCompleted({
        param($s, $e)
        if (-not $e.IsSuccess) {
            $webHost.Controls.Clear(); $script:Web = $null
            Show-Sites
            Open-External $script:WebStartUrl
            return
        }
        $core = $script:Web.CoreWebView2
        # Nexus "Mod Manager Download" buttons
        $core.Add_NavigationStarting({ param($s2, $e2) if ($e2.Uri -like "nxm://*") { $e2.Cancel = $true; Handle-Nxm $e2.Uri } })
        try { $core.Add_LaunchingExternalUriScheme({ param($s2, $e2) if ($e2.Uri -like "nxm://*") { $e2.Cancel = $true; Handle-Nxm $e2.Uri } }) } catch { }
        # pop-ups and "open in new tab" stay in the same view
        $core.Add_NewWindowRequested({ param($s2, $e2) $e2.Handled = $true; $script:Web.CoreWebView2.Navigate($e2.Uri) })
        $core.Add_SourceChanged({ $txtAddr.Text = $script:Web.Source.AbsoluteUri; $btnBack.Enabled = $script:Web.CanGoBack; $btnFwd.Enabled = $script:Web.CanGoForward })
        # every mod archive downloaded from any site comes straight to the Install page
        $core.Add_DownloadStarting({
            param($s2, $e2)
            $name = [IO.Path]::GetFileName($e2.ResultFilePath)
            $ext = [IO.Path]::GetExtension($name).ToLower()
            # a video (live wallpaper): offered as the app's background instead of a mod
            if (@(".mp4", ".webm", ".mov", ".m4v", ".mkv", ".wmv", ".avi") -contains $ext) {
                $e2.ResultFilePath = Join-Path (Get-LookDir) ("bg-" + [guid]::NewGuid().ToString("N").Substring(0, 8) + $ext)
                $e2.Handled = $true
                $op = $e2.DownloadOperation
                Reset-DlProgress
                $op.Add_BytesReceivedChanged({ param($o) Show-DlProgress $o.BytesReceived $(if ($o.TotalBytesToReceive) { [long]$o.TotalBytesToReceive } else { 0 }) "live wallpaper" })
                $op.Add_StateChanged({
                    param($o)
                    $st = [string]$o.State
                    if ($st -eq "Completed") { Set-LiveWallpaper $o.ResultFilePath }
                    elseif ($st -eq "Interrupted") { Set-Status ("Download stopped: " + [string]$o.InterruptReason) $C_RED }
                })
                Set-Status "Downloading the live wallpaper..." $C_TEXT $false
                return
            }
            if (@(".zip", ".rar", ".7z", ".oiv") -notcontains $ext) {
                $mime = ([string]$e2.DownloadOperation.MimeType).ToLower()
                if ($ARCHIVE_MIME.ContainsKey($mime)) { $name = $name + $ARCHIVE_MIME[$mime] } else { return }   # not a mod: normal download
            }
            $dir = Join-Path (Get-DataDir) "downloads"
            if (-not (Test-Path $dir)) { New-Item -ItemType Directory $dir | Out-Null }
            $e2.ResultFilePath = Join-Path $dir $name
            $e2.Handled = $true
            $script:WebModName = Get-ModNameFromTitle $script:Web.CoreWebView2.DocumentTitle
            $op = $e2.DownloadOperation
            Reset-DlProgress
            $op.Add_BytesReceivedChanged({ param($o) Show-DlProgress $o.BytesReceived $(if ($o.TotalBytesToReceive) { [long]$o.TotalBytesToReceive } else { 0 }) ([IO.Path]::GetFileName($o.ResultFilePath)) })
            $op.Add_StateChanged({
                param($o)
                $st = [string]$o.State
                if ($st -eq "Completed") {
                    Show-Page $PG_INSTALL
                    Load-Mod $o.ResultFilePath
                    if ($script:WebModName) { $txtMod.Text = $script:WebModName }
                } elseif ($st -eq "Interrupted") {
                    Set-Status ("Download stopped: " + [string]$o.InterruptReason) $C_RED
                }
            })
            Set-Status ("Downloading " + $name + "...") $C_TEXT $false
        })
    })
    return $true
}

function Open-External($url) {
    Start-Process $url
    if (-not $script:Watcher) { $chkWatch.Checked = $true }
    Set-Status "Opened in your normal browser. Downloaded mods will pop up here automatically." $C_AMBER
}

function Open-Browser($url) {
    if (-not $script:Game) { Show-Page $PG_SETTINGS; Set-Status "Pick your GTA IV folder first." $C_RED; return }
    if ($url -notmatch '^[a-z]+://') { $url = "https://" + $url }
    Show-Page $PG_GET
    $script:WebStartUrl = $url
    if (-not (Init-Web)) { Open-External $url; return }
    $sites.Visible = $false; $webHost.Visible = $true
    $txtAddr.Text = $url
    if ($script:Web.CoreWebView2) { $script:Web.CoreWebView2.Navigate($url) } else { $script:Web.Source = [Uri]$url }
}

function Show-Sites { $webHost.Visible = $false; $sites.Visible = $true; $txtAddr.Text = "" }

# ----------------------------------------------------------------------------
#  Window
# ----------------------------------------------------------------------------
$PG_GET = 0; $PG_INSTALL = 1; $PG_MINE = 2; $PG_SETTINGS = 3
$C_NAV = [System.Drawing.Color]::FromArgb(12, 13, 15)
$F_NAV = New-Font @("Barlow Condensed SemiBold", "Segoe UI") 14 ([System.Drawing.FontStyle]::Bold)
$F_BIG = New-Font @("Barlow Condensed SemiBold", "Segoe UI") 14 ([System.Drawing.FontStyle]::Bold)

function New-Button($text, $x, $y, $w, $h, $primary = $false) {
    if ($script:UI) { $b = New-Object LCMI.SmoothButton } else { $b = New-Object System.Windows.Forms.Button }
    $b.Text = $text; $b.Location = New-Object System.Drawing.Point($x, $y); $b.Size = New-Object System.Drawing.Size($w, $h)
    $b.FlatStyle = "Flat"; $b.Font = $F_BTN; $b.Cursor = [System.Windows.Forms.Cursors]::Hand
    if ($primary) { $b.BackColor = $C_BLUE; $b.ForeColor = [System.Drawing.Color]::FromArgb(12, 16, 22); $b.FlatAppearance.BorderSize = 0 }
    else { $b.BackColor = $C_PANEL2; $b.ForeColor = $C_TEXT; $b.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(70, 74, 82) }
    return $b
}
function New-Label($text, $x, $y, $w, $h, $font, $color) {
    $l = New-Object System.Windows.Forms.Label
    $l.Text = $text; $l.Location = New-Object System.Drawing.Point($x, $y); $l.Size = New-Object System.Drawing.Size($w, $h)
    $l.Font = $font; $l.ForeColor = $color; $l.BackColor = [System.Drawing.Color]::Transparent
    return $l
}
function New-List($cols) {
    if ($script:UI) { $lv = New-Object LCMI.DarkListView; $lv.HeaderFont = $F_COL } else { $lv = New-Object System.Windows.Forms.ListView }
    $lv.View = "Details"; $lv.FullRowSelect = $true; $lv.HideSelection = $false; $lv.Dock = "Fill"
    $lv.BackColor = $C_PANEL2; $lv.ForeColor = $C_TEXT; $lv.BorderStyle = "None"; $lv.Font = $F_BODY
    foreach ($c in $cols) { [void]$lv.Columns.Add($c[0], $c[1]) }
    return $lv
}
function New-Panel($dock, $h, $color) {
    $p = New-Object System.Windows.Forms.Panel
    if ($dock) { $p.Dock = $dock }; if ($h) { $p.Height = $h }; if ($color) { $p.BackColor = $color } else { $p.Tag = "follow" }
    return $p
}
# a friendly note under a page title (a second row in the title bar)
$GFX_NOTE = "Psst! Graphics mods (ENB, ReShade, RTX Remix) are the one thing I can't install - drop those in by hand, and leave the rest to me ;)"
function Add-HeadingNote([string]$text) {
    $h = $script:LastHeading
    $h.Height += 30
    $n = New-Label $text 16 ($h.Height - 36) 1100 24 $F_SMALL $C_AMBER
    $h.Controls.Add($n)
}
# a page title bar: solid dark (so the background video never mixes with the text),
# the title and its explanation on one line, and a thin blue line under it
function Add-Heading($page, $title, $sub) {
    $gap = New-Panel "Top" 12 $null
    $page.Controls.Add($gap)
    $h = New-Panel "Top" 58 ([System.Drawing.Color]::FromArgb(14, 15, 18))
    $tf = New-Font @("Bebas Neue", "Arial Narrow", "Segoe UI") 28 ([System.Drawing.FontStyle]::Bold)
    $tt = $title.ToUpper()
    $tw = 160
    try { $tw = [System.Windows.Forms.TextRenderer]::MeasureText($tt, $tf).Width } catch { }
    $h.Controls.Add((New-Label $tt 14 7 ($tw + 8) 42 $tf ([System.Drawing.Color]::White)))
    $h.Controls.Add((New-Label $sub ($tw + 34) 21 900 22 $F_BODY ([System.Drawing.Color]::FromArgb(196, 198, 206))))
    $line = New-Object System.Windows.Forms.Panel
    $line.Dock = "Bottom"; $line.Height = 2; $line.BackColor = $C_BLUE
    $h.Controls.Add($line)
    $page.Controls.Add($h)
    $script:LastHeading = $h
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "Liberty City Mod Loader IV $APP_VERSION"
$form.Size = New-Object System.Drawing.Size(1200, 780)
$form.MinimumSize = New-Object System.Drawing.Size(1000, 660)
$form.StartPosition = "CenterScreen"
$form.BackColor = $C_BG; $form.ForeColor = $C_TEXT; $form.Font = $F_BODY
$form.AllowDrop = $true
$ICON_PATH = Join-Path $APP_DIR "icon.ico"
if (Test-Path $ICON_PATH) { try { $form.Icon = New-Object System.Drawing.Icon($ICON_PATH) } catch { } }

# content area (added first so the bars dock around it)
$content = New-Panel "Fill" 0 $C_BG
$content.Padding = New-Object System.Windows.Forms.Padding(22, 14, 22, 14)
$form.Controls.Add($content)

# left navigation
$nav = New-Panel "Left" 0 $C_NAV
$nav.Width = 210
$form.Controls.Add($nav)
$navItems = @(@("Get Mods", "Browse any mod site"), @("Install", "Port of Liberty"), @("My Mods", "Your Garage"), @("Settings", "Game folder and more"))
$navButtons = @()
for ($i = 0; $i -lt 4; $i++) {
    if ($script:UI) {
        $b = New-Object LCMI.SmoothButton
        $b.Text = $navItems[$i][0].ToUpper() + "`n" + $navItems[$i][1]
        $b.SubFont = $F_NAVSUB; $b.PadLeft = 20; $b.Radius = 8
        $b.Location = New-Object System.Drawing.Point(10, (18 + $i * 64)); $b.Size = New-Object System.Drawing.Size(190, 56)
    } else {
        $b = New-Object System.Windows.Forms.Button
        $b.Text = "   " + $navItems[$i][0] + "`n   " + $navItems[$i][1]
        $b.Location = New-Object System.Drawing.Point(0, (18 + $i * 64)); $b.Size = New-Object System.Drawing.Size(210, 58)
    }
    $b.TextAlign = "MiddleLeft"; $b.Font = $F_NAV
    $b.FlatStyle = "Flat"; $b.FlatAppearance.BorderSize = 0; $b.Cursor = [System.Windows.Forms.Cursors]::Hand
    $b.BackColor = $C_NAV; $b.ForeColor = $C_DIM; $b.Tag = $i
    $nav.Controls.Add($b); $navButtons += $b
}
$navMark = New-Panel $null 0 $C_BLUE
$navMark.Size = New-Object System.Drawing.Size(4, $(if ($script:UI) { 36 } else { 58 }))
$nav.Controls.Add($navMark); $navMark.BringToFront()

# status bar
$status = New-Panel "Bottom" 34 ([System.Drawing.Color]::Black)
$lblStatus = New-Label "Welcome to Liberty City." 16 8 1100 20 $F_BODY $C_DIM
$lblStatus.Anchor = "Left, Top, Right"
$status.Controls.Add($lblStatus)
$form.Controls.Add($status)

# header
$stripe = New-Panel "Top" 3 $C_BLUE
$form.Controls.Add($stripe)
$header = New-Panel "Top" 80 ([System.Drawing.Color]::Black)
$header.Controls.Add((New-Label "LIBERTY CITY" 18 2 420 52 $F_LOGO ([System.Drawing.Color]::White)))
$header.Controls.Add((New-Label "M O D    L O A D E R    I V" 22 52 320 22 $F_SUB $C_BLUE))
$lblTag = New-Label ($TAGLINES | Get-Random) 560 14 610 22 $F_SMALL $C_DIM
$lblTag.TextAlign = "MiddleRight"; $lblTag.Anchor = "Top, Right"
$header.Controls.Add($lblTag)
$lblGame = New-Object System.Windows.Forms.LinkLabel
$lblGame.Location = New-Object System.Drawing.Point(960, 46); $lblGame.Size = New-Object System.Drawing.Size(210, 22)
$lblGame.TextAlign = "MiddleRight"; $lblGame.Anchor = "Top, Right"; $lblGame.Font = $F_BOLD
$lblGame.LinkColor = $C_GREEN; $lblGame.ActiveLinkColor = $C_TEXT; $lblGame.LinkBehavior = "HoverUnderline"; $lblGame.BackColor = [System.Drawing.Color]::Transparent
$header.Controls.Add($lblGame)
$btnMusic = New-Button ([string][char]0x266A + "  Music") 0 42 110 30
$btnMusic.Anchor = "Top, Right"
$lblNow = New-Label "" 0 48 330 20 $F_SMALL $C_DIM
$lblNow.TextAlign = "MiddleRight"; $lblNow.Anchor = "Top, Right"; $lblNow.AutoEllipsis = $true
$header.Controls.Add($btnMusic); $header.Controls.Add($lblNow)
$header.Add_Resize({ $lblGame.Left = $header.Width - 20 - $lblGame.Width; $btnMusic.Left = $lblGame.Left - 10 - $btnMusic.Width; $lblNow.Left = $btnMusic.Left - $lblNow.Width - 10 })
$btnMusic.BringToFront()
$form.Controls.Add($header)

function Set-Status($text, $color, [bool]$newTagline = $true) {
    $changed = ($lblStatus.Text -ne $text)
    $lblStatus.Text = $text
    if ($script:UI -and $changed -and $newTagline) { [LCMI.Anim]::ForeColor($lblStatus, [System.Drawing.Color]::White, $color, 700) } else { $lblStatus.ForeColor = $color }
    if ($newTagline) { $lblTag.Text = ($TAGLINES | Get-Random) }
}

$pages = @()
$script:NavIdle = $C_NAV; $script:CurrentPage = 0
for ($i = 0; $i -lt 4; $i++) {
    # pages are "video panels": the background video is copied onto them with one fast step
    if ($script:UI) { $p = New-Object LCMI.VideoPanel; $p.Dock = "Fill"; $p.BackColor = $C_BG } else { $p = New-Panel "Fill" 0 $C_BG }
    $p.Visible = $false; $content.Controls.Add($p); $pages += $p
}
function Show-Page($i) {
    $prevPage = $script:CurrentPage
    $script:CurrentPage = $i
    for ($k = 0; $k -lt 4; $k++) {
        $pages[$k].Visible = ($k -eq $i)
        $navButtons[$k].BackColor = $(if ($k -eq $i) { $C_PANEL } else { $script:NavIdle })
        $navButtons[$k].ForeColor = $(if ($k -eq $i) { [System.Drawing.Color]::White } else { $C_DIM })
    }
    $markY = 18 + $i * 64 + $(if ($script:UI) { 10 } else { 0 })
    if ($script:UI -and $script:UiReady) {
        [LCMI.Anim]::MoveTo($navMark, 0, $markY, 260)
        if ($prevPage -ne $i) { [LCMI.Anim]::SlideIn($pages[$i], 16, 150) }
    } else { $navMark.Location = New-Object System.Drawing.Point(0, $markY) }
    if ($i -eq $PG_MINE) {
        $tc = @(); try { $tc = @(Tidy-FoundMods) } catch { }; Refresh-Garage
        try { Update-TsBar } catch { }
        # look through the game folder again at most once a minute (Refresh does it right away)
        $stale = (-not $script:FoundScanAt) -or ((Get-Date) - $script:FoundScanAt).TotalSeconds -gt 60
        try { Update-FoundBar $stale } catch { }
        if ($tc.Count -gt 0) { Show-TidyChanges $tc }
    }
    if ($i -eq $PG_SETTINGS) { Refresh-Essentials; Refresh-Storage }
}
foreach ($b in $navButtons) { $b.Add_Click({ Show-Page $this.Tag }) }

# ============================================================================
#  Page: Get Mods
# ============================================================================
$pGet = $pages[$PG_GET]

# browser area and the site list share the space under the address bar
$webHost = New-Panel "Fill" 0 ([System.Drawing.Color]::White)
$webHost.Visible = $false
$pGet.Controls.Add($webHost)

$sites = New-Panel "Fill" 0 $null
$sites.AutoScroll = $true
$pGet.Controls.Add($sites)

# address bar: works as a search box for any website
$bar = New-Panel "Top" 48 $null
$btnHome = New-Button "Sites" 0 8 70 32
$btnBack = New-Button "<" 76 8 36 32
$btnFwd  = New-Button ">" 116 8 36 32
$btnReload = New-Button "Reload" 156 8 70 32
$txtAddr = New-Object System.Windows.Forms.TextBox
$txtAddr.Location = New-Object System.Drawing.Point(234, 12); $txtAddr.Size = New-Object System.Drawing.Size(600, 26)
$txtAddr.Anchor = "Left, Top, Right"; $txtAddr.Font = $F_BIG
$txtAddr.BackColor = $C_PANEL2; $txtAddr.ForeColor = $C_TEXT; $txtAddr.BorderStyle = "FixedSingle"
$btnGo = New-Button "Go" 842 8 90 32 $true
$btnGo.Anchor = "Top, Right"
$btnCloseWeb = New-Button "Close" 0 8 80 32
foreach ($c in @($btnHome, $btnBack, $btnFwd, $btnReload, $txtAddr, $btnGo, $btnCloseWeb)) { $bar.Controls.Add($c) }
$bar.Add_Resize({ $btnCloseWeb.Left = $bar.Width - $btnCloseWeb.Width; $btnGo.Left = $btnCloseWeb.Left - $btnGo.Width - 8; $txtAddr.Width = $btnGo.Left - 242 })
$btnCloseWeb.Add_Click({ Show-Sites; Set-Status "Browser closed." $C_DIM })
$pGet.Controls.Add($bar)
Add-Heading $pGet "Get Mods" "Pick a site, press its Download button - the mod lands in Install. Any website works."

# how it works strip
$steps = New-Panel "Top" 78 $null
$steps.Add_Resize({ $w = [math]::Floor(($steps.Width - 8 - 24) / 3); $i = 0; foreach ($sp in $steps.Controls) { $sp.Left = 4 + $i * ($w + 12); $sp.Width = $w; foreach ($l in $sp.Controls) { $l.Width = $w - 24 }; $i++ } })
$stepText = @("1   Pick a site below, or paste any link in the bar above", "2   Find a mod and click the site's Download button", "3   Check where the files go, then press Install")
for ($i = 0; $i -lt 3; $i++) {
    if ($script:UI) { $sp = New-Object LCMI.Card; $sp.Fill = $C_PANEL; $sp.Radius = 10 } else { $sp = New-Object System.Windows.Forms.Panel; $sp.BackColor = $C_PANEL }
    $sp.Location = New-Object System.Drawing.Point((4 + $i * 360), 12); $sp.Size = New-Object System.Drawing.Size(348, 56)
    $sl = New-Label $stepText[$i] 14 6 324 44 $F_BOLD $C_TEXT
    $sl.TextAlign = "MiddleLeft"
    $sp.Controls.Add($sl); $steps.Controls.Add($sp)
}

$tiles = New-Object System.Windows.Forms.FlowLayoutPanel
$tiles.Dock = "Top"; $tiles.AutoSize = $true; $tiles.WrapContents = $true; $tiles.Tag = "follow"
$tiles.Padding = New-Object System.Windows.Forms.Padding(0, 6, 0, 0)

$SITE_LIST = @(
    @("LibertyCity", "The biggest GTA 4 library: cars, skins, scripts, maps.", "https://libertycity.net/files/gta-4/"),
    @("Nexus Mods", "Quality mods and fixes. Log in once, then use Manual Download.", "https://www.nexusmods.com/games/gta4"),
    @("GTAinside", "Huge collection of cars, weapons and skins.", "https://www.gtainside.com/gta4/"),
    @("ModDB", "Big total conversions and overhauls.", "https://www.moddb.com/games/grand-theft-auto-iv/mods"),
    @("GTAForums", "Scripts and plugins, straight from the modders.", "https://gtaforums.com/forum/326-scripts-plugins/"),
    @("LCPDFR", "Police mods, cars and scripts for GTA IV.", "https://www.lcpdfr.com/downloads/gta4mods/"),
    @("Gillian's Guide", "Step-by-step setup guide and trusted mod list.", "https://gillian-guide.github.io/companion-mods/")
)
function New-Tile($title, $desc, $url) {
    if ($script:UI) {
        $t = New-Object LCMI.Card
        $t.Fill = $C_PANEL2; $t.HoverFill = [System.Drawing.Color]::FromArgb(48, 54, 64); $t.Accent = $C_BLUE; $t.Radius = 12
        $t.Border = [System.Drawing.Color]::FromArgb(46, 50, 58)
    } else { $t = New-Object System.Windows.Forms.Panel; $t.BackColor = $C_PANEL2 }
    $t.Size = New-Object System.Drawing.Size(290, 96); $t.Margin = New-Object System.Windows.Forms.Padding(4, 4, 8, 8)
    $t.Cursor = [System.Windows.Forms.Cursors]::Hand; $t.Tag = $url
    $edge = New-Panel $null 0 $C_BLUE; $edge.Location = New-Object System.Drawing.Point(0, 0); $edge.Size = New-Object System.Drawing.Size(5, 96)
    if ($script:UI) { $edge.Visible = $false }
    $l1 = New-Label $title 18 12 260 28 $F_HEAD ([System.Drawing.Color]::White)
    $l2 = New-Label $desc 19 44 262 44 $F_BODY $C_DIM
    foreach ($c in @($edge, $l1, $l2)) { $c.Tag = $url; $c.Cursor = [System.Windows.Forms.Cursors]::Hand; $t.Controls.Add($c) }
    $click = { Open-Browser $this.Tag }
    $enter = { $p = $(if ($this -is [System.Windows.Forms.Panel] -and $this.Width -gt 10) { $this } else { $this.Parent }); $p.BackColor = [System.Drawing.Color]::FromArgb(46, 50, 58) }
    $leave = { $p = $(if ($this -is [System.Windows.Forms.Panel] -and $this.Width -gt 10) { $this } else { $this.Parent }); $p.BackColor = $C_PANEL2 }
    foreach ($c in @($t, $edge, $l1, $l2)) { $c.Add_Click($click); if (-not $script:UI) { $c.Add_MouseEnter($enter); $c.Add_MouseLeave($leave) } }
    return $t
}
foreach ($s in $SITE_LIST) { $tiles.Controls.Add((New-Tile $s[0] $s[1] $s[2])) }

$tip = New-Panel "Top" 76 $null
$tipCard = New-Panel "" 0 $null; $tipCard.Tag = "glass"; $tipCard.Location = New-Object System.Drawing.Point(4, 10); $tipCard.Size = New-Object System.Drawing.Size(1060, 58)
$tipCard.Controls.Add((New-Label "Found a mod somewhere else? Paste its page in the bar above. Downloaded it with Chrome or Edge? Just drag the file onto this window." 12 7 1040 22 $F_BODY $C_TEXT))
$tipCard.Controls.Add((New-Label "Mods from Mediafire, Google Drive and Mega links work in the built-in browser too." 12 31 1040 22 $F_SMALL $C_DIM))
$tip.Controls.Add($tipCard)
$tip.Add_Resize({ $tipCard.Width = [math]::Max(300, $tip.Width - 8); foreach ($l in $tipCard.Controls) { $l.Width = $tipCard.Width - 20 } })

$sites.Controls.Add($tip); $sites.Controls.Add($tiles); $sites.Controls.Add($steps)

$btnHome.Add_Click({ Show-Sites })
$btnBack.Add_Click({ if ($script:Web -and $script:Web.CanGoBack) { $script:Web.GoBack() } })
$btnFwd.Add_Click({ if ($script:Web -and $script:Web.CanGoForward) { $script:Web.GoForward() } })
$btnReload.Add_Click({ if ($script:Web) { $script:Web.Reload() } })
$btnGo.Add_Click({ Handle-Link $txtAddr.Text })
$txtAddr.Add_KeyDown({ if ($_.KeyCode -eq "Enter") { Handle-Link $txtAddr.Text; $_.SuppressKeyPress = $true } })

# ============================================================================
#  Page: Install
# ============================================================================
$pIns = $pages[$PG_INSTALL]

$lvPlan = New-List @(@("File", 220), @("Goes to", 380), @("Type", 110), @("Note", 280))
$pIns.Controls.Add($lvPlan)

# bottom: install button
$act = New-Panel "Bottom" 62 $null
$lblPlan = New-Label "Nothing loaded yet." 0 12 640 40 $F_BODY $C_DIM
$btnInstall = New-Button "Install" 0 10 220 44 $true
$btnInstall.Font = $F_BIG; $btnInstall.Anchor = "Top, Right"; $btnInstall.Enabled = $false
$btnPics = New-Button "View Pictures" 0 14 170 36
$btnPics.Visible = $false
$btnCancelPlan = New-Button "Cancel" 0 14 110 36
$btnCancelPlan.Visible = $false
$act.Controls.Add($lblPlan); $act.Controls.Add($btnInstall); $act.Controls.Add($btnPics); $act.Controls.Add($btnCancelPlan)
function Place-ActBar {
    $btnInstall.Left = $act.Width - $btnInstall.Width
    $x = $btnInstall.Left
    if ($btnPics.Visible) { $btnPics.Left = $x - $btnPics.Width - 12; $x = $btnPics.Left }
    if ($btnCancelPlan.Visible) { $btnCancelPlan.Left = $x - $btnCancelPlan.Width - 12; $x = $btnCancelPlan.Left }
    $lblPlan.Width = [math]::Max(200, $x - 12)
}
$btnCancelPlan.Add_Click({ Clear-Plan; Place-ActBar; $script:UpdateQueue = @(); Set-Status "Cancelled. Nothing was installed." $C_DIM })
$act.Add_Resize({ Place-ActBar })
$btnPics.Add_Click({ Show-Pictures -1 })
$lvPlan.Add_DoubleClick({
    if ($lvPlan.SelectedItems.Count -eq 0) { return }
    $row = $script:Plan[$lvPlan.SelectedItems[0].Index]
    if ($row -and $row.Kind -eq "PREVIEW") { Show-Pictures $lvPlan.SelectedItems[0].Index }
    elseif ($row -and ($row.Kind -eq "MANUAL" -or ($row.Kind -eq "SKIP" -and [string]$row.Note -like "Left out*")) -and ($row.Source -notmatch '(?i)\.exe$')) { Choose-RowFolder $row }
})
# you pick the folder for a file the app couldn't place - and it remembers for next time
function Choose-RowFolder($row) {
    if (-not $script:Game) { return }
    $name = [IO.Path]::GetFileName($row.Source)
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = "Where does $name go? Pick a folder inside your GTA IV folder."
    $dlg.SelectedPath = $script:Game
    if ($dlg.ShowDialog() -ne "OK") { return }
    $pick = $dlg.SelectedPath.TrimEnd("\")
    if (-not $pick.StartsWith($script:Game, [StringComparison]::OrdinalIgnoreCase)) {
        [System.Windows.Forms.MessageBox]::Show("Please pick a folder inside your GTA IV folder:`n$($script:Game)", "Choose folder", "OK", "Warning") | Out-Null
        return
    }
    $rel = $pick.Substring($script:Game.Length).TrimStart("\")
    $row.Dest = $(if ($rel) { "$rel\$name" } else { $name })
    $row.Kind = $(if ($rel -like "scripts*") { "SCRIPT" } else { "GAME FOLDER" })
    $row.Note = "You chose this folder (remembered for next time)"
    Save-Learned $name $rel
    Show-Plan
}

# picture viewer: arrows or Left/Right keys flip, Esc closes
function Show-Pictures([int]$planIndex) {
    $pics = @($script:Plan | Where-Object { $_.Kind -eq "PREVIEW" -and (Test-Path -LiteralPath $_.Source) })
    if ($pics.Count -eq 0) { return }
    $script:PicList = $pics; $script:PicAt = 0
    if ($planIndex -ge 0) { $src = $script:Plan[$planIndex].Source; for ($i = 0; $i -lt $pics.Count; $i++) { if ($pics[$i].Source -eq $src) { $script:PicAt = $i } } }
    $v = New-Object System.Windows.Forms.Form
    $v.Text = "Preview - " + $script:PlanMod; $v.Size = New-Object System.Drawing.Size(960, 700); $v.StartPosition = "CenterParent"
    $v.BackColor = [System.Drawing.Color]::FromArgb(10, 11, 13); $v.KeyPreview = $true; $v.MinimumSize = New-Object System.Drawing.Size(480, 360)
    if ($form.Icon) { $v.Icon = $form.Icon }
    $script:PicBox = New-Object System.Windows.Forms.PictureBox
    $script:PicBox.Dock = "Fill"; $script:PicBox.SizeMode = "Zoom"; $script:PicBox.BackColor = $v.BackColor
    $bar = New-Panel "Bottom" 56 ([System.Drawing.Color]::Black)
    $bPrev = New-Button "<  Previous" 12 10 130 36
    $bNext = New-Button "Next  >" 150 10 130 36
    $script:PicLabel = New-Label "" 296 10 600 36 $F_BIG $C_TEXT
    $script:PicLabel.TextAlign = "MiddleLeft"
    $bar.Controls.Add($bPrev); $bar.Controls.Add($bNext); $bar.Controls.Add($script:PicLabel)
    $v.Controls.Add($script:PicBox); $v.Controls.Add($bar)
    $bPrev.Add_Click({ Show-PicAt ($script:PicAt - 1) })
    $bNext.Add_Click({ Show-PicAt ($script:PicAt + 1) })
    $v.Add_KeyDown({
        if ($_.KeyCode -eq "Left") { Show-PicAt ($script:PicAt - 1); $_.Handled = $true }
        elseif ($_.KeyCode -eq "Right") { Show-PicAt ($script:PicAt + 1); $_.Handled = $true }
        elseif ($_.KeyCode -eq "Escape") { $this.Close() }
    })
    $v.Add_FormClosed({ if ($script:PicBox.Image) { $script:PicBox.Image.Dispose(); $script:PicBox.Image = $null } })
    Show-PicAt $script:PicAt
    if ($script:UI) { try { [LCMI.Dark]::Window($v) } catch { } }
    [void]$v.ShowDialog($form)
    $v.Dispose()
}
function Show-PicAt([int]$i) {
    $n = $script:PicList.Count
    if ($n -eq 0) { return }
    $i = (($i % $n) + $n) % $n
    $script:PicAt = $i
    $old = $script:PicBox.Image
    try {
        $ms = New-Object System.IO.MemoryStream(, [System.IO.File]::ReadAllBytes($script:PicList[$i].Source))
        $img = [System.Drawing.Image]::FromStream($ms)
        $script:PicBox.Image = New-Object System.Drawing.Bitmap($img)
        $img.Dispose(); $ms.Dispose()
        $script:PicLabel.Text = "{0} of {1}   -   {2}   ({3} x {4})" -f ($i + 1), $n, [IO.Path]::GetFileName($script:PicList[$i].Source), $script:PicBox.Image.Width, $script:PicBox.Image.Height
    } catch {
        $script:PicBox.Image = $null
        $script:PicLabel.Text = "{0} of {1}   -   {2}   (can't show this picture)" -f ($i + 1), $n, [IO.Path]::GetFileName($script:PicList[$i].Source)
    }
    if ($old) { $old.Dispose() }
}
$pIns.Controls.Add($act)

# summary: mod name + counts
$sum = New-Panel "Top" 64 $null
$sum.Tag = "glass"
$sum.Controls.Add((New-Label "Mod name" 10 22 80 22 $F_BOLD $C_TEXT))
$txtMod = New-Object System.Windows.Forms.TextBox
$txtMod.Location = New-Object System.Drawing.Point(96, 18); $txtMod.Size = New-Object System.Drawing.Size(360, 26); $txtMod.Font = $F_BIG
$txtMod.BackColor = $C_PANEL2; $txtMod.ForeColor = $C_TEXT; $txtMod.BorderStyle = "FixedSingle"
$sum.Controls.Add($txtMod)
function New-Chip($x, $color) {
    $l = New-Label "" $x 16 170 32 $F_BOLD $color
    $l.BackColor = $C_PANEL; $l.TextAlign = "MiddleCenter"
    return $l
}
$chipReady = New-Chip 444 $C_GREEN; $chipManual = New-Chip 622 $C_AMBER; $chipSkip = New-Chip 800 $C_DIM
$sum.Controls.Add($chipReady); $sum.Controls.Add($chipManual); $sum.Controls.Add($chipSkip)
$pIns.Controls.Add($sum)

# drop zone
if ($script:UI) {
    $drop = New-Object LCMI.Card; $drop.Dock = "Top"; $drop.Height = 120
    $drop.Fill = $C_PANEL; $drop.HoverFill = [System.Drawing.Color]::FromArgb(33, 37, 44); $drop.Radius = 14
    $drop.Border = [System.Drawing.Color]::FromArgb(70, 100, 132); $drop.Dashed = $true
} else { $drop = New-Panel "Top" 120 $C_PANEL }
$lblDrop = New-Label "Drop a mod here" 0 18 600 30 $F_HEAD ([System.Drawing.Color]::White)
$lblDrop2 = New-Label ".zip  .rar  .7z  .oiv  or a folder - from any website" 0 48 600 20 $F_BODY $C_DIM
$lblDrop.TextAlign = "MiddleCenter"; $lblDrop2.TextAlign = "MiddleCenter"
$btnZip = New-Button "Choose File..." 0 76 150 32
$btnDir = New-Button "Choose Folder..." 0 76 150 32
foreach ($c in @($lblDrop, $lblDrop2, $btnZip, $btnDir)) { $drop.Controls.Add($c) }
$drop.Add_Resize({
    $lblDrop.Width = $drop.Width; $lblDrop2.Width = $drop.Width
    $btnZip.Left = [int]($drop.Width / 2) - 156; $btnDir.Left = [int]($drop.Width / 2) + 6
})
$pIns.Controls.Add($drop)
Add-Heading $pIns "Install" "Check where each file goes. Your original game files are never touched."
Add-HeadingNote $GFX_NOTE

function Clear-Plan {
    $lvPlan.Items.Clear(); $script:Plan = @(); $btnInstall.Enabled = $false
    $script:PlanWarning = ""; $script:PlanChecks = @(); $script:PlanSource = $null
    $lblPlan.Text = "Nothing loaded yet."; $chipReady.Text = ""; $chipManual.Text = ""; $chipSkip.Text = ""
    $chipReady.Visible = $false; $chipManual.Visible = $false; $chipSkip.Visible = $false
    $btnPics.Visible = $false; if ($btnCancelPlan) { $btnCancelPlan.Visible = $false }
    if ($script:PlanTemp -and (Test-Path $script:PlanTemp)) { Remove-Item $script:PlanTemp -Recurse -Force -ErrorAction SilentlyContinue }
    $script:PlanTemp = ""
}

function Load-Mod($path) {
    $script:GameFileIndex = $null; $script:BinIndex = $null
    if (-not $script:Game) { Show-Page $PG_SETTINGS; Set-Status "Pick your GTA IV folder first." $C_RED; return }
    Show-Page $PG_INSTALL
    Clear-Plan
    try {
        Set-Status "Unloading the shipment at the docks..." $C_DIM
        $form.Refresh()
        $tmp = Expand-Mod $path
        $script:PlanTemp = $tmp
        $name = [IO.Path]::GetFileNameWithoutExtension($path) -replace "^[0-9_]+", "" -replace "[ _\-]*[0-9]{6,}.*$", "" -replace "[_\-]+", " "
        if (-not (Clean-Name $name)) { $name = [IO.Path]::GetFileNameWithoutExtension($path) }
        if (-not (Clean-Name $name)) { $name = "Mod " + (Get-Date).ToString("yyyy-MM-dd HHmm") }
        $nx = Get-NexusFromName ([IO.Path]::GetFileName($path))
        if ($nx -and (Clean-Name $nx.Name)) { $name = $nx.Name }
        $script:PlanMod = Clean-Name $name
        if ($nx) {
            $script:PlanSource = $nx.Source
            $have = @(Load-Db) | Where-Object { (Get-ModSource $_) -and [string](Get-ModSource $_).NexusId -eq [string]$nx.Source.NexusId } | Select-Object -First 1
            if ($have) { $script:PlanMod = [string]$have.Name }
        }
        $script:Plan = @(Build-Plan $tmp $script:PlanMod)
        if (@($script:Plan | Where-Object { $_.Kind -eq "CORE" }).Count -gt 0) { $script:PlanMod = "Fusion Fix" }
        $script:PlanChecks = @(); try { $script:PlanChecks = @(Get-ModChecks $tmp $script:Plan) } catch { }
        $txtMod.Text = $script:PlanMod
        Show-Plan
    } catch {
        Set-Status ("Couldn't open that mod: " + $_.Exception.Message) $C_RED
    }
}

function Show-Plan {
    $lvPlan.Items.Clear()
    $ok = 0; $manual = 0; $skip = 0; $pics = 0
    foreach ($row in $script:Plan) {
        $it = New-Object System.Windows.Forms.ListViewItem([IO.Path]::GetFileName($row.Source))
        $dest = $row.Dest; if (-not $dest) { $dest = "-" }
        $kind = switch ($row.Kind) { "OVERLOADER" { "Game file" } "SCRIPT" { "Script" } "GAME FOLDER" { "Plugin" } "IMG" { "Packed model" } "ARCHIVE" { "Into archive" } "CORE" { "Fusion Fix" } "GRAPHICS" { "Graphics" } "MANUAL" { "Needs you" } "SKIP" { "Skipped" } "PREVIEW" { "Preview" } "DATA LINES" { "Adds lines" } default { $row.Kind } }
        [void]$it.SubItems.Add($dest); [void]$it.SubItems.Add($kind); [void]$it.SubItems.Add($row.Note)
        if ($row.Kind -eq "MANUAL") { $it.ForeColor = $C_AMBER; $manual++ }
        elseif ($row.Kind -eq "SKIP") { $it.ForeColor = $C_DIM; $skip++ }
        elseif ($row.Kind -eq "PREVIEW") { $it.ForeColor = [System.Drawing.Color]::FromArgb(140, 170, 200); $pics++ }
        else { $ok++ }
        [void]$lvPlan.Items.Add($it)
    }
    $chipReady.Text = "$ok ready"; $chipManual.Text = "$manual need you"
    $parts = @()
    if ($pics -gt 0) { $parts += "$pics preview" + $(if ($pics -ne 1) { "s" } else { "" }) }
    if ($skip -gt 0) { $parts += "$skip skipped" }
    $chipSkip.Text = $parts -join "  -  "
    $chipReady.Visible = $true; $chipManual.Visible = ($manual -gt 0); $chipSkip.Visible = (($skip + $pics) -gt 0)
    $btnPics.Visible = ($pics -gt 0); $btnPics.Text = "View Pictures ($pics)"
    $btnCancelPlan.Visible = ($script:Plan.Count -gt 0)
    Place-ActBar
    $btnInstall.Enabled = ($ok -gt 0)
    if ($script:PlanWarning) { $lblPlan.Text = $script:PlanWarning }
    elseif ($ok -eq 0) { $lblPlan.Text = "Nothing here can be installed automatically - check the mod's readme." }
    elseif ($manual -gt 0) { $lblPlan.Text = "Amber files will be left out (the Note says why). The rest installs fine." }
    else { $lblPlan.Text = "Everything has a place. Press Install." }
    if (@($script:PlanChecks | Where-Object { $_ }).Count -gt 0) { $lblPlan.Text = "Heads up: " + @($script:PlanChecks | Where-Object { $_ }).Count + " thing(s) to know - shown when you press Install. " + $lblPlan.Text }
    if ($script:PlanWarning -and $ok -eq 0) { Set-Status $script:PlanWarning $C_RED }
    elseif ($manual -gt 0) { Set-Status "$manual file(s) can't be placed automatically - the amber rows say why. Everything else installs." $C_AMBER }
    else { Set-Status "Checked. Everything has a destination." $C_GREEN }
}

$txtMod.Add_TextChanged({
    $new = Clean-Name $txtMod.Text
    if (-not $new -or $script:Plan.Count -eq 0 -or $new -eq $script:PlanMod) { return }
    $old = $script:PlanMod
    foreach ($row in $script:Plan) { if ($row.Dest -like "update\$old\*") { $row.Dest = "update\$new\" + $row.Dest.Substring(("update\$old\").Length) } }
    $script:PlanMod = $new
    Show-Plan
})
$btnZip.Add_Click({
    $d = New-Object System.Windows.Forms.OpenFileDialog
    $d.Filter = "Mod archives (*.zip;*.rar;*.7z;*.oiv)|*.zip;*.rar;*.7z;*.oiv|All files (*.*)|*.*"
    $d.InitialDirectory = Get-DownloadsFolder
    if ($d.ShowDialog() -eq "OK") { Load-Mod $d.FileName }
})
$btnDir.Add_Click({
    $d = New-Object System.Windows.Forms.FolderBrowserDialog
    $d.Description = "Choose the folder that contains the mod"
    if ($d.ShowDialog() -eq "OK") { Load-Mod $d.SelectedPath }
})
$btnInstall.Add_Click({ if (-not $script:Game) { Show-Page $PG_SETTINGS; Set-Status "Pick your GTA IV folder first - click Change... below." $C_RED; return }; 
    Install-Plan
    if ($script:Plan.Count -eq 0) { Show-Page $PG_MINE }   # installed: show it in My Mods
})

$form.Add_DragEnter({ if ($_.Data.GetDataPresent([Windows.Forms.DataFormats]::FileDrop)) { $_.Effect = "Copy" } })
$form.Add_DragDrop({
    $paths = $_.Data.GetData([Windows.Forms.DataFormats]::FileDrop)
    if ($paths.Count -gt 0) { if ([string]$paths[0] -match '(?i)\.lcmods$') { Show-Page $PG_MINE; Import-ModList $paths[0] } else { Load-Mod $paths[0] } }
})

# ============================================================================
#  Page: My Mods (installed mods + conflict check)
# ============================================================================
$pMine = $pages[$PG_MINE]

$lvGarage = New-List @(@("Mod", 470), @("Status", 80), @("Installed", 150), @("Files", 60), @("Replaced", 86), @("Version", 190))
$lvGarage.CheckBoxes = $true
if ($script:UI) { $lvGarage.SetRowHeight(46); $lvGarage.ShowThumbs = $true }
$lvGarage.AllowDrop = $true
$pMine.Controls.Add($lvGarage)

$gBtns = New-Panel "Bottom" 58 $null
$btnUninstall = New-Button "Uninstall" 0 12 150 38
$btnFiles = New-Button "Show Files" 158 12 130 38
$btnOpenGame = New-Button "Open Game Folder" 296 12 170 38
$btnFind = New-Button "Find Other Mods" 474 12 170 38
$btnCheck = New-Button "Check for Conflicts" 0 12 200 38 $true
$btnCheck.Anchor = "Top, Right"
foreach ($c in @($btnUninstall, $btnFiles, $btnOpenGame, $btnFind, $btnCheck)) { $gBtns.Controls.Add($c) }
$gBtns.Add_Resize({ $btnCheck.Left = $gBtns.Width - $btnCheck.Width })

$lcpdBox = New-Panel "Bottom" 170 $null
$lvLcpd = New-List @(@("Result", 150), @("What", 330), @("Where", 520))
$lcpdHead = New-Panel "Top" 30 $null
$lblLcpdHead = New-Label "LCPD Records - conflicts between your mods" 0 6 700 22 $F_BOLD ([System.Drawing.Color]::White)
$lcpdHead.Controls.Add($lblLcpdHead)
$btnCloseLcpd = New-Button "Close" 0 0 80 26
$lcpdHead.Controls.Add($btnCloseLcpd)
$lcpdHead.Add_Resize({ $btnCloseLcpd.Left = $lcpdHead.Width - $btnCloseLcpd.Width })
$btnCloseLcpd.Add_Click({ $lcpdBox.Visible = $false })
$lcpdBox.Controls.Add($lvLcpd); $lcpdBox.Controls.Add($lcpdHead)
$lcpdBox.Visible = $false

# trouble bar: play without mods, find the broken mod, read the logs
$tsBar = New-Panel "Bottom" 52 ([System.Drawing.Color]::FromArgb(22, 24, 30))
$lblTs = New-Label "Something wrong in the game?" 14 8 420 36 $F_BODY $C_TEXT
$lblTs.TextAlign = "MiddleLeft"
$btnTsA = New-Button "Play Without Mods" 0 8 170 36
$btnTsB = New-Button "Find the Broken Mod" 0 8 180 36
$btnTsC = New-Button "Stop" 0 8 160 36
foreach ($c in @($lblTs, $btnTsA, $btnTsB, $btnTsC)) { $tsBar.Controls.Add($c) }
function Place-TsBar {
    $x = $tsBar.Width - 12
    foreach ($b in @($btnTsC, $btnTsB, $btnTsA)) { if ($b.Visible) { $x -= $b.Width; $b.Left = $x; $x -= 8 } }
    $lblTs.Width = [math]::Max(200, $x - 20)
}
$tsBar.Add_Resize({ Place-TsBar })
function Update-TsBar {
    $st = $null; try { $st = Load-Ts } catch { }
    $btnTsA.Visible = $true; $btnTsB.Visible = $true; $btnTsC.Visible = $true
    if (-not $st) {
        $lblTs.Text = "Something wrong in the game?"; $lblTs.ForeColor = $C_TEXT
        $btnTsA.Text = "Play Without Mods"; $btnTsB.Text = "Find the Broken Mod"; $btnTsC.Visible = $false
    } elseif ($st.Mode -eq "nomods") {
        $lblTs.Text = "Your mods are off for testing (Fusion Fix stays on). Play, then turn them back on."; $lblTs.ForeColor = $C_AMBER
        $btnTsA.Text = "Turn My Mods Back On"; $btnTsB.Visible = $false; $btnTsC.Visible = $false
    } else {
        $off = @($st.TestOff).Count
        $lblTs.Text = $(if ([int]$st.Step -eq 0) { "Test 1: all $off mod(s) are off. Start the game - is the problem still there?" } else { "Test $([int]$st.Step + 1): $off mod(s) are off. Start the game - is the problem still there?" })
        $lblTs.ForeColor = $C_AMBER
        $btnTsA.Text = "Still There"; $btnTsB.Text = "It's Gone"; $btnTsC.Text = "Stop"
    }
    Place-TsBar
}
$btnTsA.Add_Click({
    $st = Load-Ts
    if (-not $st) { Start-NoMods }
    elseif ($st.Mode -eq "nomods") { Stop-Troubleshoot }
    else { Answer-FindBroken $true }
    Update-TsBar; try { Refresh-Garage } catch { }
})
$btnTsB.Add_Click({
    $st = Load-Ts
    if (-not $st) {
        $r = [System.Windows.Forms.MessageBox]::Show("The app will turn your mods off and on in groups. After each change, start the game, check if the problem is still there, close the game and press the answer here.`n`nFusion Fix stays on. When the broken mod is found, all your other mods go back on.`n`nStart?", "Find the Broken Mod", "YesNo", "Question")
        if ($r -ne "Yes") { return }
        Start-FindBroken
    } elseif ($st.Mode -eq "find") { Answer-FindBroken $false }
    Update-TsBar; try { Refresh-Garage } catch { }
})
$btnTsC.Add_Click({
    $st = Load-Ts
    if ($st -and $st.Mode -eq "find") { Stop-Troubleshoot; Update-TsBar; try { Refresh-Garage } catch { } }
})

$pMine.Controls.Add($lcpdBox)
$pMine.Controls.Add($tsBar)
$pMine.Controls.Add($gBtns)

# banner: mods that were put in the game folder without this app
if ($script:UI) {
    $foundBar = New-Object LCMI.Card; $foundBar.Dock = "Top"; $foundBar.Height = 54
    $foundBar.Fill = [System.Drawing.Color]::FromArgb(40, 36, 26); $foundBar.Accent = $C_AMBER; $foundBar.Radius = 10
} else { $foundBar = New-Panel "Top" 54 ([System.Drawing.Color]::FromArgb(40, 36, 26)) }
$foundBar.Visible = $false
$lblFound = New-Label "" 18 8 700 38 $F_BODY $C_TEXT
$lblFound.TextAlign = "MiddleLeft"
$btnReview = New-Button "Review" 0 10 130 34 $true
$foundBar.Controls.Add($lblFound); $foundBar.Controls.Add($btnReview)
$btnHideFound = New-Button "Hide" 0 10 80 34
$foundBar.Controls.Add($btnHideFound)
$foundBar.Add_Resize({ $btnHideFound.Left = $foundBar.Width - $btnHideFound.Width - 12; $btnReview.Left = $btnHideFound.Left - $btnReview.Width - 8; $lblFound.Width = [math]::Max(200, $btnReview.Left - 30) })
$btnHideFound.Add_Click({ $foundBar.Visible = $false; $foundGap.Visible = $false; $script:FoundHidden = $true })
$foundGap = New-Panel "Top" 8 $null
$pMine.Controls.Add($foundGap); $pMine.Controls.Add($foundBar)
Add-Heading $pMine "My Mods" "Tick = on/off. Drag = order (lower wins)."
$btnRefreshMine = New-Button "Refresh" 0 12 110 34
$btnCleanUp = New-Button "Clean Up" 0 12 120 34
$script:LastHeading.Controls.Add($btnRefreshMine); $btnRefreshMine.BringToFront()
$script:LastHeading.Controls.Add($btnCleanUp); $btnCleanUp.BringToFront()
$mineHead = $script:LastHeading
$mineHead.Add_Resize({ $btnRefreshMine.Left = $mineHead.Width - $btnRefreshMine.Width - 12; $btnCleanUp.Left = $btnRefreshMine.Left - $btnCleanUp.Width - 8 })
$btnCleanUp.Add_Click({ Show-CleanUp })
$btnArchives = New-Button "Archives" 0 12 120 34
$script:LastHeading.Controls.Add($btnArchives); $btnArchives.BringToFront()
$mineHead.Add_Resize({ $btnArchives.Left = $btnCleanUp.Left - $btnArchives.Width - 8 })
$btnArchives.Add_Click({ Show-Archives })
$btnUpdates = New-Button "Updates" 0 12 110 34
$btnShare = New-Button "Share" 0 12 100 34
$script:LastHeading.Controls.Add($btnUpdates); $btnUpdates.BringToFront()
$script:LastHeading.Controls.Add($btnShare); $btnShare.BringToFront()
$mineSub = @($mineHead.Controls | Where-Object { $_ -is [System.Windows.Forms.Label] -and $_.Text -like "Tick*" })[0]
$mineHead.Add_Resize({
    $x = $mineHead.Width - 12
    foreach ($b in @($btnRefreshMine, $btnCleanUp, $btnArchives, $btnUpdates, $btnShare)) { $x -= $b.Width; $b.Left = $x; $x -= 8 }
    $sw = 300; try { $sw = [System.Windows.Forms.TextRenderer]::MeasureText($mineSub.Text, $mineSub.Font).Width } catch { }
    if ($mineSub) { $mineSub.Visible = ($mineSub.Left + $sw + 12 -lt $btnShare.Left) }
})
$btnUpdates.Add_Click({ Check-Updates })
$btnShare.Add_Click({
    $r = [System.Windows.Forms.MessageBox]::Show("Yes = save your mod list to a file you can send to a friend`nNo = open a list a friend sent you", "Share", "YesNoCancel", "Question")
    if ($r -eq "Yes") { Export-ModList } elseif ($r -eq "No") { Import-ModList }
})

# drag a mod up or down to change which one wins (files dropped here still install)
$lvGarage.Add_ItemDrag({ if ($_.Item -and $_.Item.Tag -ne "nothumb") { [void]$lvGarage.DoDragDrop($_.Item, [System.Windows.Forms.DragDropEffects]::Move) } })
$lvGarage.Add_DragEnter({ if ($_.Data.GetDataPresent([Windows.Forms.DataFormats]::FileDrop)) { $_.Effect = "Copy" } elseif ($_.Data.GetDataPresent([System.Windows.Forms.ListViewItem])) { $_.Effect = "Move" } })
$lvGarage.Add_DragOver({
    if ($_.Data.GetDataPresent([Windows.Forms.DataFormats]::FileDrop)) { $_.Effect = "Copy"; return }
    if (-not $_.Data.GetDataPresent([System.Windows.Forms.ListViewItem])) { return }
    $_.Effect = "Move"
    $pt = $lvGarage.PointToClient((New-Object System.Drawing.Point($_.X, $_.Y)))
    $hit = $lvGarage.GetItemAt(8, $pt.Y)
    $at = $(if ($hit) { $hit.Index + $(if ($pt.Y -gt $hit.Bounds.Top + $hit.Bounds.Height / 2) { 1 } else { 0 }) } else { $lvGarage.Items.Count })
    if ($script:UI -and $lvGarage.DropLine -ne $at) { $lvGarage.DropLine = $at; $lvGarage.Invalidate() }
    $script:GarageDropAt = $at
    if ($pt.Y -lt 30 -and $lvGarage.TopItem -and $lvGarage.TopItem.Index -gt 0) { $lvGarage.EnsureVisible($lvGarage.TopItem.Index - 1) }
    elseif ($pt.Y -gt $lvGarage.ClientSize.Height - 30 -and $hit -and $hit.Index -lt $lvGarage.Items.Count - 1) { $lvGarage.EnsureVisible($hit.Index + 1) }
})
$lvGarage.Add_DragLeave({ if ($script:UI) { $lvGarage.DropLine = -1; $lvGarage.Invalidate() } })
$lvGarage.Add_DragDrop({
    if ($script:UI) { $lvGarage.DropLine = -1; $lvGarage.Invalidate() }
    if ($_.Data.GetDataPresent([Windows.Forms.DataFormats]::FileDrop)) { $paths = $_.Data.GetData([Windows.Forms.DataFormats]::FileDrop); if ($paths.Count -gt 0) { if ([string]$paths[0] -match '(?i)\.lcmods$') { Import-ModList $paths[0] } else { Load-Mod $paths[0] } }; return }
    $item = $_.Data.GetData([System.Windows.Forms.ListViewItem])
    if (-not $item) { return }
    $name = $item.Text
    Move-ModOrder $name ([int]$script:GarageDropAt)
    Refresh-Garage
    foreach ($it in $lvGarage.Items) { if ($it.Text -eq $name) { $it.Selected = $true; $it.EnsureVisible() } }
})
$btnRefreshMine.Add_Click({
    Set-Status "Checking your game folder..." $C_DIM $false; $form.Refresh()
    $script:FoundHidden = $false; $script:FileTextCache = $null; $script:FoundTimes = $null; $script:TidySig = $null
    $tc = @(); try { $tc = @(Tidy-FoundMods) } catch { }
    Refresh-Garage
    Update-FoundBar
    Show-TidyChanges $tc $true
    $n = @($script:FoundMods).Count
    if ($tc.Count -eq 0) { Set-Status $(if ($n -gt 0) { "Refreshed. $n mod(s) found that aren't in the list yet - see the bar at the top." } else { "Refreshed. Your list is up to date." }) $C_GREEN }
})

function Set-GarageRow($it, [bool]$on) {
    $it.SubItems[1].Text = $(if ($on) { "On" } else { "Off" })
    $it.ForeColor = $(if ($on) { $C_TEXT } else { $C_DIM })
}

function Refresh-Garage {
    $script:GarageBusy = $true
    try {
        $lvGarage.Items.Clear()
        if (-not $script:Game) { return }
        $mods = @(Load-Db)
        foreach ($m in $mods) {
            $it = New-Object System.Windows.Forms.ListViewItem([string]$m.Name)
            [void]$it.SubItems.Add("")
            $lib = Test-InLibrary $m
            $data = Get-DataDir
            $libDir = Join-Path $data ("library\" + $m.Name); $repDir = Join-Path $data "replaced"
            $repl = 0; $miss = 0
            if ($lib) {
                foreach ($f in @($m.Files)) {
                    if (-not $f -or ([string]$f).Contains("|")) { continue }
                    if ([IO.File]::Exists((Join-Path $repDir ([string]$f)))) { $repl++ }
                    if (-not [IO.File]::Exists((Join-Path $libDir ([string]$f)))) { $miss++ }
                }
            } else { $repl = @($m.Backups).Count }
            [void]$it.SubItems.Add([string]$m.Date); [void]$it.SubItems.Add([string]@($m.Files).Count); [void]$it.SubItems.Add([string]$repl)
            $src = Get-ModSource $m
            $ver = $(if ($src -and $src.Version) { [string]$src.Version } elseif ($src -and $src.NexusId) { "Nexus" } else { "-" })
            $upd = $(if ($src -and $src.PSObject.Properties["Update"] -and $src.Update) { [string]$src.Update } else { "" })
            [void]$it.SubItems.Add($(if ($upd) { $ver + "  ->  " + $upd + "  (update!)" } else { $ver }))
            $on = Test-ModOn $m
            $it.Checked = $on
            Set-GarageRow $it $on
            if ($lib) {
                # its own copy of a file was deleted outside the app
                if ((Get-ModArchives $m).Count -gt 0 -and $on -and -not (Test-Path -LiteralPath (Join-Path $script:Game $ARCHIVE_DIR))) { $miss++ }
                if ($miss -gt 0) { $it.SubItems[1].Text = "Missing"; $it.ForeColor = $C_AMBER }
            } elseif ($on) {
                # files deleted outside the app since it was installed
                $arcInner = @(Get-ModArchives $m | ForEach-Object { [string]$_.Inner })
                $miss = 0
                foreach ($mf in @($m.Files)) {
                    if (-not $mf -or $arcInner -contains [string]$mf) { continue }
                    if (-not (Test-Path -LiteralPath (Join-Path $script:Game ([string]$mf)))) { $miss++ }
                }
                if ($arcInner.Count -gt 0 -and -not (Test-Path -LiteralPath (Join-Path $script:Game $ARCHIVE_DIR))) { $miss++ }
                if ($miss -gt 0) { $it.SubItems[1].Text = "Missing"; $it.ForeColor = $C_AMBER }
            }
            [void]$lvGarage.Items.Add($it)
        }
        try { Load-Thumbs $mods } catch { }
        if ($mods.Count -eq 0) {
            $it = New-Object System.Windows.Forms.ListViewItem("No mods here yet - head to Get Mods, or press Find Other Mods.")
            $it.ForeColor = $C_DIM; $it.Tag = "nothumb"
            [void]$lvGarage.Items.Add($it)
        }
    } finally { $script:GarageBusy = $false }
}

# tick = on, untick = off
# tick = on, untick = off - but only when YOU click. Windows also "ticks" every box by itself when it
# rebuilds the list (for example when you open My Mods); those are ignored and the box is set back.
$script:GarageClickAt = -100000
$lvGarage.Add_MouseDown({ $script:GarageClickAt = [Environment]::TickCount })
$lvGarage.Add_KeyDown({ if ($_.KeyCode -eq "Space") { $script:GarageClickAt = [Environment]::TickCount } })
$lvGarage.Add_ItemChecked({
    if ($script:GarageBusy) { return }
    $it = $_.Item
    $name = $it.Text
    $m = @(Load-Db) | Where-Object { $_.Name -eq $name } | Select-Object -First 1
    if (-not $m) { $script:GarageBusy = $true; $it.Checked = $false; $script:GarageBusy = $false; return }
    $on = Test-ModOn $m
    if ($it.Checked -eq $on) { return }                                             # nothing changed
    if (([Environment]::TickCount - $script:GarageClickAt) -gt 1500) {             # not your click: put the box back
        $script:GarageBusy = $true; $it.Checked = $on; $script:GarageBusy = $false; return
    }
    $script:GarageBusy = $true
    try {
        if ($it.Checked) {
            $ok = Enable-Mod $name
            if ($ok -eq $false) { $it.Checked = $false }
        } else { Disable-Mod $name }
        Set-GarageRow $it $it.Checked
    } finally { $script:GarageBusy = $false }
})
function Get-SelectedMod {
    if ($lvGarage.SelectedItems.Count -eq 0) { Set-Status "Pick a mod from the list first." $C_AMBER; return $null }
    $name = $lvGarage.SelectedItems[0].Text
    if (-not (@(Load-Db) | Where-Object { $_.Name -eq $name })) { return $null }
    return $name
}
$btnUninstall.Add_Click({
    $name = Get-SelectedMod; if (-not $name) { return }
    $mm = @(Load-Db) | Where-Object { $_.Name -eq $name } | Select-Object -First 1
    if ($mm -and ($mm.PSObject.Properties.Name -contains "Found") -and $mm.Found) {
        $r = [System.Windows.Forms.MessageBox]::Show("'$name' wasn't installed by this app.`n`nUninstalling deletes its $(@($mm.Files).Count) file(s) for good - there's no original to put back.`n`nTip: untick it instead to just turn it off.`n`nDelete it?", "My Mods", "YesNo", "Warning")
    } else { $r = [System.Windows.Forms.MessageBox]::Show("Uninstall '$name'?", "My Mods", "YesNo", "Question") }
    if ($r -eq "Yes") { Uninstall-Mod $name }
})
$btnFiles.Add_Click({
    $name = Get-SelectedMod; if (-not $name) { return }
    $m = @(Load-Db) | Where-Object { $_.Name -eq $name } | Select-Object -First 1
    $list = @($m.Files)
    $txt = (@($list | Select-Object -First 40) -join "`n")
    if ($list.Count -gt 40) { $txt += "`n...and $($list.Count - 40) more" }
    [System.Windows.Forms.MessageBox]::Show($txt, "$name - files", "OK", "Information") | Out-Null
})
$btnOpenGame.Add_Click({ if ($script:Game) { Start-Process explorer.exe $script:Game } })
$btnCheck.Add_Click({ $lcpdBox.Visible = $true; Run-LcpdCheck })

# ----------------------------------------------------------------------------
#  Mods installed without this app (by hand or with another tool)
# ----------------------------------------------------------------------------
$WRAPPER_DLLS = @("d3d9.dll", "d3d8.dll", "d3d11.dll", "dxgi.dll", "dsound.dll", "winmm.dll", "version.dll", "xlive.dll")
function Get-Stem($n) { return ($n -replace '(?i)\.(net\.dll|asi|dll|cs|vb|ini|cfg|xml|txt|json|log|toml|dat)$', '') }
function Test-CoreFile($rel) {
    $n = (Split-Path $rel -Leaf).ToLower()
    if ($n -match '^put .* here' -or $n -match '^(read ?me|readme_|changelog|license)' -or $n -eq "desktop.ini" -or $n -eq "thumbs.db") { return $true }   # notes and placeholders, not mods
    if ($n -match '\.(log|dmp|tmp)$' -or $rel -match '(?i)(^|\\)(logs?|crashdumps?)\\' -or $n -match '(^|_)(log|metrics)(_|\.txt$)|session_log|^metrics\.txt$') { return $true }   # logs, not mods
    if ($rel -ieq "dinput8.dll") { return $true }                        # Fusion Fix's mod loader
    if ($rel -match '(?i)fusionfix') { return $true }                     # Fusion Fix itself
    return $false
}
function Find-ExternalMods {
    $g = $script:Game
    if (-not $g) { return @() }
    $owned = @{}
    foreach ($m in @(Load-Db)) { foreach ($f in @($m.Files)) { if ($f) { $owned[([string]$f).ToLower()] = $true } } }
    $groups = [ordered]@{}
    $add = {
        param($key, $name, $where, $rel)
        if ($owned.ContainsKey($rel.ToLower()) -or (Test-CoreFile $rel)) { return }
        if ($rel -match '(?i)^update\\' -and $MERGE_TARGETS -contains $rel.Substring(7).ToLower()) { return }   # the combined data list
        if (-not $groups.Contains($key)) { $groups[$key] = [pscustomobject]@{ Key = $key; Name = $name; Where = $where; Files = (New-Object System.Collections.ArrayList) } }
        [void]$groups[$key].Files.Add($rel)
    }
    $relOf = { param($full) $full.Substring($g.Length).TrimStart("\") }
    # update folder: each folder is one mod (Fusion Overloader style)
    $up = Join-Path $g "update"
    if (Test-Path $up) {
        foreach ($d in @(Get-ChildItem -LiteralPath $up -Directory -ErrorAction SilentlyContinue)) {
            if ($d.Name -ieq (Split-Path $ARCHIVE_DIR -Leaf) -or $d.Name -ieq (Split-Path $DATA_DIR -Leaf)) { continue }
            $loose = @("pc", "common", "tlad", "tbogt") -contains $d.Name.ToLower()
            foreach ($f in @(Get-ChildItem -LiteralPath $d.FullName -Recurse -File -ErrorAction SilentlyContinue)) {
                $rel = & $relOf $f.FullName
                if ($loose) { & $add "update:~loose" "Loose files in update" "update" $rel }
                else { & $add ("update:" + $d.Name.ToLower()) $d.Name ("update\" + $d.Name) $rel }
            }
        }
        foreach ($f in @(Get-ChildItem -LiteralPath $up -File -ErrorAction SilentlyContinue)) { & $add "update:~loose" "Loose files in update" "update" (& $relOf $f.FullName) }
    }
    # scripts and plugins: one mod per name (MyMod.asi + MyMod.ini) or per subfolder
    foreach ($top in @("scripts", "plugins")) {
        $base = Join-Path $g $top
        if (-not (Test-Path $base)) { continue }
        foreach ($f in @(Get-ChildItem -LiteralPath $base -Recurse -File -ErrorAction SilentlyContinue)) {
            $rel = & $relOf $f.FullName
            $inner = $rel.Substring($top.Length + 1)
            if ($inner.Contains("\")) { $nm = $inner.Split("\")[0] } else { $nm = Get-Stem $f.Name }
            & $add ("$($top):" + $nm.ToLower()) $nm $top $rel
        }
    }
    # game folder: .asi plugins, ScriptHook, graphics wrappers (ENB / ReShade)
    $rootFiles = @(Get-ChildItem -LiteralPath $g -File -ErrorAction SilentlyContinue)
    $isEnb = (Test-Path (Join-Path $g "enbseries.ini")) -or (Test-Path (Join-Path $g "enblocal.ini"))
    $isReshade = (Test-Path (Join-Path $g "reshade-shaders")) -or (@($rootFiles | Where-Object { $_.Name -like "ReShade*.ini" }).Count -gt 0)
    $gfxName = $(if ($isEnb) { "ENB" } elseif ($isReshade) { "ReShade" } else { "Graphics / loader" })
    $asiStems = @($rootFiles | Where-Object { $_.Extension -ieq ".asi" } | ForEach-Object { (Get-Stem $_.Name).ToLower() })
    foreach ($f in $rootFiles) {
        $n = $f.Name.ToLower(); $rel = $f.Name
        if ($n -match '^scripthook') { & $add "root:scripthook" "ScriptHook" "game folder" $rel; continue }
        if ($f.Extension -ieq ".asi") { & $add ("root:" + (Get-Stem $n)) (Get-Stem $f.Name) "game folder" $rel; continue }
        if ($f.Extension -ieq ".ini" -and $asiStems -contains (Get-Stem $n)) { & $add ("root:" + (Get-Stem $n)) (Get-Stem $f.Name) "game folder" $rel; continue }
        if ($WRAPPER_DLLS -contains $n -or $n -match '^(enbseries|enblocal|enbpalette|enbbloom|enbsunsprite|enblens|d3d9)\.' -or $n -match '^reshade.*\.(ini|log)$' -or $f.Extension -ieq ".fx") {
            & $add "root:gfx" $gfxName "game folder" $rel; continue
        }
    }
    foreach ($dn in @("enbseries", "reshade-shaders")) {
        $dp = Join-Path $g $dn
        if (Test-Path $dp) { foreach ($f in @(Get-ChildItem -LiteralPath $dp -Recurse -File -ErrorAction SilentlyContinue)) { & $add "root:gfx" $gfxName "game folder" (& $relOf $f.FullName) } }
    }
    foreach ($gr in @($groups.Values)) {
        if ($gr.Key -eq "root:gfx" -and $gr.Name -eq "Graphics / loader" -and $gr.Files.Count -eq 1) { $gr.Name = [string]$gr.Files[0] }
    }
    $list = @(Join-FoundGroups @($groups.Values | Where-Object { $_.Files.Count -gt 0 }))
    # extra files of a mod (its settings, its data folder) join that mod instead of showing on their own
    foreach ($pair in @(Find-MergePairs $list)) { foreach ($f in @($pair.From.Files)) { [void]$pair.To.Files.Add($f) }; $pair.From.Files.Clear() }
    return @($list | Where-Object { $_.Files.Count -gt 0 -and (Test-IsModGroup $_.Files) })
}

# friendly name and type for the review window
function Get-FoundLabel($fm) {
    $n = ([string]$fm.Name -replace '^[\d\.\-_ ~!]+(?=\S)', '') -replace '_', ' '
    if (-not $n.Trim()) { $n = [string]$fm.Name }
    $k = [string]$fm.Key
    $type = $(if ($k -eq "update:~loose") { "Loose files" } elseif ($k -like "update:*") { "Mod" } elseif ($k -like "scripts:*") { "Script" } elseif ($k -like "plugins:*") { "Plugin" }
              elseif ($k -eq "root:scripthook") { "Script loader" } elseif ($k -eq "root:gfx") { "Graphics" } else { "Plugin" })
    return [pscustomobject]@{ Name = $n.Trim(); Type = $type }
}

# ---- which "mod" is really just files of another mod? ----
# a real mod has at least one file the game or a loader actually uses
function Test-IsModGroup($files) {
    foreach ($f in @($files)) {
        $r = [string]$f
        if ($r -match '(?i)^update\\') { return $true }
        if ($r -match '(?i)\.(asi|dll|cs|vb|img|rpf|wtd|wdr|wft|wdd|wbd|wbn|wpl|ide|ipl|dat|gxt|sco|nod|wad|whm|fx|fxh|usda|usd|usdc|dds)$') { return $true }
        if ($r -match '(?i)^(enbseries|reshade-shaders|rtx_comp|rtx-remix)\\|^(enbseries|enblocal|rtx)\.(ini|conf)$') { return $true }
    }
    return $false
}
function Test-HasCode($files) { return (@($files | Where-Object { [string]$_ -match '(?i)\.(asi|dll|cs|vb|exe)$' }).Count -gt 0) }
function Get-NormName([string]$n) { return (($n -replace '(?i)\.(net\.dll|asi|dll|cs|vb|ini|cfg|xml|txt|json|dat)$', '') -replace '[^A-Za-z0-9]', '').ToLower() }
function Get-FileText([string]$rel) {
    if (-not $script:FileTextCache) { $script:FileTextCache = @{} }
    if ($script:FileTextCache.ContainsKey($rel)) { return $script:FileTextCache[$rel] }
    $t = ""
    $p = Join-Path $script:Game $rel
    try { if ((Test-Path -LiteralPath $p) -and (Get-Item -LiteralPath $p).Length -lt 16MB) { $b = [IO.File]::ReadAllBytes($p); $t = [Text.Encoding]::GetEncoding(28591).GetString($b) + "`n" + [Text.Encoding]::Unicode.GetString($b) } } catch { }
    $script:FileTextCache[$rel] = $t
    return $t
}
# groups: objects with Name and Files. Returns pairs: From (settings/data only) -> To (the mod it belongs to)
function Find-MergePairs($groups, $extraTargets = @()) {
    $pairs = @()
    $coders = @(@($groups) + @($extraTargets) | Where-Object { $_ -and (Test-HasCode $_.Files) })
    foreach ($g in @($groups | Where-Object { -not (Test-HasCode $_.Files) })) {
        if ($g.Name -eq "Loose files in update" -or @($g.Files | Where-Object { [string]$_ -match '(?i)^update\\' }).Count -gt 0) { continue }   # update-folder mods stand on their own
        $gn = Get-NormName $g.Name
        # the folder these files share (e.g. scripts\Clothes Combination files) and their names
        $dirs = @($g.Files | ForEach-Object { Split-Path ([string]$_) -Parent } | Select-Object -Unique)
        $words = @()
        foreach ($d in $dirs) { $leaf = $(if ($d) { Split-Path $d -Leaf } else { "" }); if ($leaf -and @("scripts", "plugins", "update", "common", "pc", "data", "config", "settings") -notcontains $leaf.ToLower()) { $words += $leaf } }
        $words += @($g.Files | Select-Object -First 20 | ForEach-Object { Split-Path ([string]$_) -Leaf })
        $best = $null; $bestScore = 0
        foreach ($c in $coders) {
            if ($c -eq $g) { continue }
            $score = 0
            # 1. the mod's own program mentions this folder or file
            foreach ($code in @($c.Files | Where-Object { [string]$_ -match '(?i)\.(asi|dll|cs|vb)$' })) {
                $txt = Get-FileText ([string]$code)
                if (-not $txt) { continue }
                foreach ($w in $words) { if ($w.Length -ge 4 -and $txt.IndexOf($w, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $score = [math]::Max($score, 100); break } }
                if ($score -ge 100) { break }
            }
            # 2. names that belong together (IV + IV.EFLC_PersonalVehicle, d3d9.cfg + GTAIV_d3d9)
            $cn = Get-NormName $c.Name
            if ($gn.Length -ge 2 -and $cn.Length -ge 2) {
                if ($cn.StartsWith($gn) -or $gn.StartsWith($cn)) { $score = [math]::Max($score, 60) }
                elseif ($gn.Length -ge 3 -and ($cn.Contains($gn) -or $gn.Contains($cn))) { $score = [math]::Max($score, 40) }
            }
            if ($score -gt $bestScore) { $bestScore = $score; $best = $c }
        }
        if ($best -and $bestScore -ge 40) { $pairs += [pscustomobject]@{ From = $g; To = $best } }
    }
    return $pairs
}
# ---- one mod = one row: files copied in together (same few minutes) or with the same name belong together ----
function Get-FoundTime([string]$rel) {
    if (-not $script:FoundTimes) { $script:FoundTimes = @{} }
    $k = $rel.ToLower()
    if ($script:FoundTimes.ContainsKey($k)) { return $script:FoundTimes[$k] }
    $t = $null
    try { $p = Join-Path $script:Game $rel; if ([IO.File]::Exists($p)) { $t = [IO.File]::GetCreationTimeUtc($p) } } catch { }
    $script:FoundTimes[$k] = $t
    return $t
}
function Test-SharedLoader($g) {
    # used by many mods - stays its own row, so turning one mod off never breaks the others
    return ([string]$g.Key -eq "root:scripthook" -or [string]$g.Key -eq "root:gfx" -or [string]$g.Name -match '(?i)^(scripthook|scripthookdotnet|acompleteeditionhook|xlive|dinput8|asiloader)')
}
function Get-GroupRank($g) {
    $k = [string]$g.Key
    if ($k -eq "update:~loose") { return 0 }
    if ($k -like "update:*") { return 4 }
    if (@($g.Files | Where-Object { ([string]$_).Split("\").Count -gt 2 -and [string]$_ -match '(?i)^(scripts|plugins)\\' }).Count -gt 0) { return 3 }
    if (Test-HasCode $g.Files) { return 2 }
    return 1
}
function Join-FoundGroups($groups) {
    $list = New-Object System.Collections.ArrayList
    $loose = @()
    foreach ($g in @($groups)) { if ([string]$g.Key -eq "update:~loose") { $loose += $g } else { [void]$list.Add($g) } }
    # loose files in update: split by when they were copied in
    foreach ($lg in $loose) {
        $timed = @($lg.Files | ForEach-Object { [pscustomobject]@{ F = [string]$_; T = (Get-FoundTime ([string]$_)) } } | Sort-Object { if ($_.T) { $_.T } else { [datetime]::MinValue } })
        $cur = $null; $last = $null
        foreach ($x in $timed) {
            if (-not $cur -or -not $x.T -or -not $last -or ($x.T - $last).TotalSeconds -gt 120) {
                $nm = $(if ($x.T) { "Loose update files (" + $x.T.ToLocalTime().ToString("d MMM yyyy") + ")" } else { "Loose update files" })
                $cur = [pscustomobject]@{ Key = "update:~loose"; Name = $nm; Where = "update"; Files = (New-Object System.Collections.ArrayList); Date = $lg.Date }
                [void]$list.Add($cur)
            }
            [void]$cur.Files.Add($x.F); if ($x.T) { $last = $x.T }
        }
    }
    # time span of each group
    foreach ($g in $list) {
        $ts = @($g.Files | ForEach-Object { Get-FoundTime ([string]$_) } | Where-Object { $_ })
        $sp = $(if ($ts.Count -gt 0) { @(($ts | Measure-Object -Minimum).Minimum, ($ts | Measure-Object -Maximum).Maximum) } else { $null })
        $g | Add-Member -NotePropertyName Span -NotePropertyValue $sp -Force
    }
    # which groups belong together (checked once per pair), then join each set
    $n = $list.Count
    $root = New-Object int[] $n; for ($i = 0; $i -lt $n; $i++) { $root[$i] = $i }
    $find = { param($x) while ($root[$x] -ne $x) { $root[$x] = $root[$root[$x]]; $x = $root[$x] }; return $x }
    $norm = @(); $loader = @(); $tight = @()
    for ($i = 0; $i -lt $n; $i++) {
        $g = $list[$i]
        $norm += (Get-NormName $g.Name); $loader += (Test-SharedLoader $g)
        $tight += [bool]($g.Span -and (($g.Span[1] - $g.Span[0]).TotalMinutes -le 10))
    }
    for ($i = 0; $i -lt $n; $i++) {
        if ($loader[$i]) { continue }
        $a = $list[$i]
        for ($j = $i + 1; $j -lt $n; $j++) {
            if ($loader[$j]) { continue }
            $b = $list[$j]
            $join = $false
            # same name in different places (update\My Mod + scripts\MyMod.net.dll)
            $na = $norm[$i]; $nb = $norm[$j]
            if ($a.Key -ne "update:~loose" -and $b.Key -ne "update:~loose" -and $na.Length -ge 5 -and $nb.Length -ge 5) {
                $short = $(if ($na.Length -le $nb.Length) { $na } else { $nb }); $long = $(if ($na.Length -le $nb.Length) { $nb } else { $na })
                # MyMod + MyModFiles belong together, but Mod1 + Mod12 don't
                if ($na -eq $nb -or ($long.StartsWith($short) -and [char]::IsLetter($long[$short.Length]))) { $join = $true }
            }
            # copied in together (within 2 minutes), and neither is spread over a long time
            if (-not $join -and $tight[$i] -and $tight[$j]) {
                $sa = $a.Span; $sb = $b.Span
                if ($sa[0].AddSeconds(-120) -le $sb[1] -and $sb[0].AddSeconds(-120) -le $sa[1]) { $join = $true }
            }
            if ($join) { $ra = & $find $i; $rb = & $find $j; if ($ra -ne $rb) { $root[$rb] = $ra } }
        }
    }
    $sets = [ordered]@{}
    for ($i = 0; $i -lt $n; $i++) { $r = "k" + (& $find $i); if (-not $sets.Contains($r)) { $sets[$r] = @() }; $sets[$r] += $i }
    $out = New-Object System.Collections.ArrayList
    foreach ($members in $sets.Values) {
        # the best name wins: a mod folder, then a script/plugin folder, then a program file
        $keepAt = $members[0]
        foreach ($m in $members) {
            $rk = Get-GroupRank $list[$m]; $rb = Get-GroupRank $list[$keepAt]
            if ($rk -gt $rb -or ($rk -eq $rb -and $list[$m].Files.Count -gt $list[$keepAt].Files.Count)) { $keepAt = $m }
        }
        $keep = $list[$keepAt]
        foreach ($m in $members) { if ($m -ne $keepAt) { foreach ($f in @($list[$m].Files)) { [void]$keep.Files.Add($f) } } }
        [void]$out.Add($keep)
    }
    $list = $out
    return @($list)
}
# how a found file is grouped (same rules as the scan)
function Get-FoundKey([string]$rel) {
    $segs = $rel.Split("\")
    $top = $segs[0].ToLower()
    if ($top -eq "update") {
        if ($segs.Count -le 2 -or @("pc", "common", "tlad", "tbogt") -contains $segs[1].ToLower()) { return @("update:~loose", "Loose files in update") }
        return @(("update:" + $segs[1].ToLower()), $segs[1])
    }
    if ($top -eq "scripts" -or $top -eq "plugins") {
        if ($segs.Count -gt 2) { return @(("$($top):" + $segs[1].ToLower()), $segs[1]) }
        $st = Get-Stem $segs[1]
        return @(("$($top):" + $st.ToLower()), $st)
    }
    $n = $segs[-1]
    if ($n -match '(?i)^scripthook') { return @("root:scripthook", "ScriptHook") }
    if ($top -eq "enbseries" -or $top -eq "reshade-shaders" -or $n -match '(?i)^(enbseries|enblocal|enbpalette|enbbloom|enbsunsprite|enblens)\.|^reshade|\.fx$') { return @("root:gfx", "Graphics") }
    $st = Get-Stem $n
    return @(("root:" + $st.ToLower()), $st)
}
# re-sort mods added from "Find Other Mods": split wrong groups, then join extra files to the mod they belong to
function Tidy-FoundMods {
    $script:TidyDropped = @()
    if (-not $script:Game) { return @() }
    $mods = @(Load-Db)
    $found = @($mods | Where-Object { ($_.PSObject.Properties.Name -contains "Found") -and $_.Found -and (Test-ModOn $_) })
    if ($found.Count -eq 0) { return @() }
    $others = @($mods | Where-Object { $found -notcontains $_ })
    $before = (@($found | Sort-Object Name | ForEach-Object { $_.Name + "=" + (@($_.Files | Sort-Object) -join "|") }) -join ";")
    if ($script:TidySig -and $script:TidySig -eq $before) { return @() }      # nothing changed since last time
    $wasIn = @{}; foreach ($m in $found) { foreach ($f in @($m.Files)) { if ($f) { $wasIn[([string]$f).ToLower()] = [string]$m.Name } } }
    # 1. regroup every found file with the fixed naming
    $groups = [ordered]@{}
    $dateOf = @{}
    foreach ($m in $found) {
        foreach ($f in @($m.Files)) {
            if (-not $f) { continue }
            if (Test-CoreFile ([string]$f)) { $script:TidyDropped += [string]$f; continue }   # a note or log, not part of a mod
            $k = Get-FoundKey ([string]$f)
            if (-not $groups.Contains($k[0])) { $groups[$k[0]] = [pscustomobject]@{ Key = $k[0]; Name = $k[1]; Files = (New-Object System.Collections.ArrayList); Date = [string]$m.Date } }
            [void]$groups[$k[0]].Files.Add([string]$f)
        }
    }
    $list = @(Join-FoundGroups @($groups.Values))
    # a found group named after an app-installed mod's file belongs to it (e.g. the .ini of a script you installed here)
    $pairs = @(Find-MergePairs $list $others)
    $log = @()
    foreach ($pr in $pairs) {
        if ($others -contains $pr.To) { $pr.To.Files = @(@($pr.To.Files) + @($pr.From.Files) | Select-Object -Unique) }
        else { foreach ($f in @($pr.From.Files)) { [void]$pr.To.Files.Add($f) } }
        $already = @($pr.From.Files | Where-Object { $wasIn[([string]$_).ToLower()] -ne [string]$pr.To.Name }).Count -eq 0
        if (-not $already) { $log += "'" + (Get-FoundLabel $pr.From).Name + "' joined '" + $pr.To.Name + "'" }
        $pr.From.Files.Clear()
    }
    $notMods = @($list | Where-Object { $_.Files.Count -gt 0 -and -not (Test-IsModGroup $_.Files) })
    foreach ($nm in $notMods) { $script:TidyDropped += @($nm.Files) }
    $list = @($list | Where-Object { $_.Files.Count -gt 0 -and (Test-IsModGroup $_.Files) })
    $new = @()
    $taken = @{}; foreach ($o in $others) { $taken[([string]$o.Name).ToLower()] = $true }
    foreach ($g in $list) {
        $name = Clean-Name (Get-FoundLabel $g).Name
        if (-not $name) { $name = "Found mod" }
        $base = $name; $k = 2
        while ($taken.ContainsKey($name.ToLower())) { $name = "$base ($k)"; $k++ }
        $taken[$name.ToLower()] = $true
        $new += [pscustomobject]@{ Name = $name; Date = $g.Date; Files = @($g.Files); Backups = @(); Enabled = $true; Found = $true }
    }
    $after = (@($new | Sort-Object Name | ForEach-Object { $_.Name + "=" + (@($_.Files | Sort-Object) -join "|") }) -join ";")
    $toOthers = @($pairs | Where-Object { $others -contains $_.To }).Count
    if ($after -eq $before -and $toOthers -eq 0 -and $notMods.Count -eq 0) { $script:TidySig = $before; return @() }
    $script:TidySig = $after
    # move each file's saved copy to the mod it's listed under now
    $dep = Load-Deployed
    $nowIn = @{}
    foreach ($g in @($new) + @($others)) { foreach ($f in @($g.Files)) { if ($f) { $nowIn[([string]$f).ToLower()] = $g } } }
    foreach ($om in $found) {
        foreach ($f in @($om.Files | Where-Object { $_ } | ForEach-Object { [string]$_ })) {
            $from = Get-LibFile $om.Name $f
            $k = $f.ToLower()
            $to = $nowIn[$k]
            if ($to -and [string]$to.Name -ne [string]$om.Name) {
                $dst = Get-LibFile $to.Name $f
                if ((Test-Path -LiteralPath $from) -and -not (Test-Path -LiteralPath $dst)) { New-ParentDir $dst; Move-Item -LiteralPath $from -Destination $dst -Force }
                elseif (-not (Test-Path -LiteralPath $dst) -and (Test-Path -LiteralPath (Join-Path $script:Game $f))) { Place-File (Join-Path $script:Game $f) $dst }
                if ($dep.ContainsKey($k) -and $dep[$k] -eq [string]$om.Name) { $dep[$k] = [string]$to.Name }
            } elseif (-not $to) {
                # not a mod file: forget our copy (the file itself stays in the game folder)
                if (Test-Path -LiteralPath $from) { Remove-Item -LiteralPath $from -Force -ErrorAction SilentlyContinue }
                $dep.Remove($k)
            }
        }
        $ld = Join-Path (Get-DataDir) ("library\" + $om.Name)
        if ((Test-Path -LiteralPath $ld) -and @(Get-ChildItem -LiteralPath $ld -Recurse -File -Force -ErrorAction SilentlyContinue).Count -eq 0) { Remove-Item -LiteralPath $ld -Recurse -Force -ErrorAction SilentlyContinue }
    }
    foreach ($g in $new) { $g | Add-Member -NotePropertyName Library -NotePropertyValue $true -Force }
    Save-Deployed $dep
    # keep the list order: app-installed mods where they were, found mods after them in scan order
    $out = @(); $placed = $false
    foreach ($m in $mods) {
        if ($found -contains $m) { if (-not $placed) { $out += $new; $placed = $true } }
        else { $out += $m }
    }
    Save-Db $out
    # a plain list of what changed, for the popup
    $oldNames = @($found | ForEach-Object { [string]$_.Name }); $newNames = @($new | ForEach-Object { [string]$_.Name })
    $changes = @()
    $changes += @($log | ForEach-Object { $_ -replace "^'(.+)' joined '(.+)'$", '$1  ->  joined $2' })
    $droppedLower = @($script:TidyDropped | ForEach-Object { ([string]$_).ToLower() })
    foreach ($om in $found) {
        $o = [string]$om.Name
        if ($newNames -contains $o) { continue }
        $realFiles = @($om.Files | Where-Object { $_ -and $droppedLower -notcontains ([string]$_).ToLower() })
        if ($realFiles.Count -eq 0) { continue }       # only notes - reported below
        $changes += "$o  ->  removed (its files are now listed under the right mod)"
    }
    foreach ($nn in $newNames) { if ($oldNames -notcontains $nn) { $changes += "$nn  ->  new name (was part of a wrongly named row)" } }
    foreach ($d in @($script:TidyDropped | Select-Object -First 8)) { $changes += (Split-Path $d -Leaf) + "  ->  not a mod, hidden from the list (the file stays where it is)" }
    return @($changes | Select-Object -Unique)
}
function Show-TidyChanges($changes, [bool]$always = $false) {
    $changes = @($changes)
    if ($changes.Count -eq 0) {
        if ($always) { [System.Windows.Forms.MessageBox]::Show("Everything is up to date - nothing to change.", "My Mods", "OK", "Information") | Out-Null }
        return
    }
    $txt = ($changes | Select-Object -First 15 | ForEach-Object { "-  " + $_ }) -join "`n"
    if ($changes.Count -gt 15) { $txt += "`n...and $($changes.Count - 15) more" }
    [System.Windows.Forms.MessageBox]::Show("I tidied your mod list:`n`n$txt`n`nNothing was moved or deleted - only the list changed.", "My Mods", "OK", "Information") | Out-Null
    Set-Status "My Mods list tidied ($($changes.Count) change(s))." $C_GREEN
}

function Update-FoundBar([bool]$rescan = $true) {
    if (-not $script:Game) { $foundBar.Visible = $false; $foundGap.Visible = $false; return }
    if ($rescan -or $null -eq $script:FoundMods) { $script:FoundMods = @(Find-ExternalMods); $script:FoundScanAt = Get-Date }
    $n = $script:FoundMods.Count
    if ($n -eq 0 -or $script:FoundHidden) { $foundBar.Visible = $false; $foundGap.Visible = $false; return }
    $names = (@($script:FoundMods | Select-Object -First 4 | ForEach-Object { $_.Name }) -join ", ") + $(if ($n -gt 4) { ", ..." } else { "" })
    $lblFound.Text = "Found $n mod$(if ($n -ne 1) { 's' }) installed without this app:  $names`nAdd them to manage them here too (turn on/off, uninstall)."
    $foundBar.Visible = $true; $foundGap.Visible = $true
}

function Show-FoundMods {
    $found = @($script:FoundMods)
    if ($found.Count -eq 0) { Set-Status "No other mods found - everything in your game folder is managed here." $C_GREEN; return }
    $script:FoundCount = $null
    $d = New-Object System.Windows.Forms.Form
    $d.Text = "Mods installed without this app"; $d.Size = New-Object System.Drawing.Size(900, 620); $d.StartPosition = "CenterParent"
    $d.BackColor = $C_BG; $d.ForeColor = $C_TEXT; $d.Font = $F_BODY; $d.MinimumSize = New-Object System.Drawing.Size(700, 420)
    if ($form.Icon) { $d.Icon = $form.Icon }

    $top = New-Panel "Top" 84 $null
    $top.Controls.Add((New-Label "FOUND IN YOUR GAME FOLDER" 20 10 700 36 (New-Font @("Bebas Neue", "Arial Narrow", "Segoe UI") 26 ([System.Drawing.FontStyle]::Bold)) ([System.Drawing.Color]::White)))
    $top.Controls.Add((New-Label "Put there by hand or by another tool. Tick the ones to manage here - nothing is moved or deleted now." 21 50 820 22 $F_BODY $C_DIM))

    $listHost = New-Panel "Fill" 0 $null
    $listHost.AutoScroll = $true
    $listHost.Padding = New-Object System.Windows.Forms.Padding(20, 4, 20, 8)
    if ($script:UI) { try { [LCMI.Anim]::DoubleBuffer($listHost) } catch { } }

    $script:FoundRows = @()
    $pillColors = @{ "Mod" = [System.Drawing.Color]::FromArgb(70, 110, 150); "Loose files" = [System.Drawing.Color]::FromArgb(96, 100, 110); "Script" = [System.Drawing.Color]::FromArgb(88, 128, 88); "Plugin" = [System.Drawing.Color]::FromArgb(120, 96, 150)
                     "Script loader" = [System.Drawing.Color]::FromArgb(88, 128, 88); "Graphics" = [System.Drawing.Color]::FromArgb(150, 110, 60) }
    # rows are docked to the top, so they're added last-first
    for ($i = $found.Count - 1; $i -ge 0; $i--) {
        $fm = $found[$i]; $lab = Get-FoundLabel $fm
        if ($script:UI) {
            $row = New-Object LCMI.Card
            $row.Fill = $C_PANEL2; $row.HoverFill = [System.Drawing.Color]::FromArgb(46, 50, 58); $row.Radius = 10
        } else { $row = New-Object System.Windows.Forms.Panel; $row.BackColor = $C_PANEL2 }
        $row.Dock = "Top"; $row.Height = 62; $row.Cursor = [System.Windows.Forms.Cursors]::Hand; $row.Tag = $i

        $chk = New-Object System.Windows.Forms.Label
        $chk.Location = New-Object System.Drawing.Point(16, 19); $chk.Size = New-Object System.Drawing.Size(24, 24)
        $chk.TextAlign = "MiddleCenter"; $chk.Font = New-Object System.Drawing.Font("Segoe UI Symbol", 11, [System.Drawing.FontStyle]::Bold)
        $chk.Tag = $i

        $title = New-Label $lab.Name 54 8 520 26 $F_BIG ([System.Drawing.Color]::White)
        $sample = @($fm.Files | Select-Object -First 3 | ForEach-Object { [string]$_ }) -join "    "
        if ($fm.Files.Count -gt 3) { $sample += "    +" + ($fm.Files.Count - 3) + " more" }
        $sub = New-Label $sample 55 35 560 20 $F_SMALL $C_DIM
        $sub.AutoEllipsis = $true; $title.AutoEllipsis = $true

        $pill = New-Label $lab.Type 0 18 110 26 $F_COL ([System.Drawing.Color]::White)
        $pill.TextAlign = "MiddleCenter"; $pill.BackColor = $pillColors[$lab.Type]; $pill.Anchor = "Top, Right"
        $cnt = New-Label ("{0} file{1}" -f $fm.Files.Count, $(if ($fm.Files.Count -ne 1) { "s" } else { "" })) 0 18 80 26 $F_BODY $C_DIM
        $cnt.TextAlign = "MiddleRight"; $cnt.Anchor = "Top, Right"

        $clr = New-Button "Clear" 0 16 76 30
        $clr.Tag = $i
        foreach ($c in @($chk, $title, $sub, $pill, $cnt)) { $row.Controls.Add($c); $c.Tag = $i; $c.Cursor = [System.Windows.Forms.Cursors]::Hand }
        $row.Controls.Add($clr)
        $row.Add_Resize({
            $r = $script:FoundRows[[int]$this.Tag]; if (-not $r) { return }
            $w = $this.Width
            $r.Cnt.Left = $w - 80 - 16; $r.Pill.Left = $w - 110 - 104; $r.Clear.Left = $r.Pill.Left - 76 - 12
            $r.Title.Width = [math]::Max(80, $r.Clear.Left - 64); $r.Sub.Width = [math]::Max(80, $r.Clear.Left - 64)
        })
        $toggle = { Set-FoundRow ([int]$this.Tag) (-not $script:FoundRows[[int]$this.Tag].On) }
        $row.Add_Click($toggle); foreach ($c in @($chk, $title, $sub, $pill, $cnt)) { $c.Add_Click($toggle) }
        $clr.Add_Click({ Clear-FoundRows @([int]$this.Tag) })

        $gap = New-Panel "Top" 8 $null
        $listHost.Controls.Add($gap); $listHost.Controls.Add($row)
        $script:FoundRows = @([pscustomobject]@{ On = $true; Check = $chk; Title = $title; Sub = $sub; Pill = $pill; Cnt = $cnt; Clear = $clr; Row = $row; Gap = $gap; Removed = $false; Files = @($fm.Files) }) + $script:FoundRows
    }
    for ($i = 0; $i -lt $found.Count; $i++) { Set-FoundRow $i $true }

    $bar = New-Panel "Bottom" 66 $null
    $bAdd = New-Button "Add to My Mods" 0 14 200 38 $true
    $bCancel = New-Button "Cancel" 0 14 110 38
    $bAll = New-Button "Tick All" 20 14 110 38
    $bNone = New-Button "Untick All" 138 14 110 38
    $bClearAll = New-Button "Clear All" 256 14 110 38
    $script:FoundCount = New-Label "" 380 14 260 38 $F_BODY $C_DIM
    $script:FoundCount.TextAlign = "MiddleLeft"
    foreach ($c in @($bAdd, $bCancel, $bAll, $bNone, $bClearAll, $script:FoundCount)) { $bar.Controls.Add($c) }
    $bClearAll.Add_Click({ Clear-FoundRows @(0..($script:FoundRows.Count - 1)) })
    $bar.Add_Resize({ $bAdd.Left = $bar.Width - $bAdd.Width - 20; $bCancel.Left = $bAdd.Left - $bCancel.Width - 10 })
    $bAll.Add_Click({ for ($i = 0; $i -lt $script:FoundRows.Count; $i++) { if (-not $script:FoundRows[$i].Removed) { Set-FoundRow $i $true } } })
    $bNone.Add_Click({ for ($i = 0; $i -lt $script:FoundRows.Count; $i++) { Set-FoundRow $i $false } })
    $bCancel.Add_Click({ $d.DialogResult = "Cancel"; $d.Close() })
    $bAdd.Add_Click({ $d.DialogResult = "OK"; $d.Close() })
    Update-FoundCount

    $d.Controls.Add($listHost); $d.Controls.Add($bar); $d.Controls.Add($top)
    if ($script:UI) { try { [LCMI.Dark]::Window($d) } catch { } }
    $res = $d.ShowDialog($form)
    $picked = @()
    for ($i = 0; $i -lt $found.Count; $i++) { if ($script:FoundRows[$i].On -and -not $script:FoundRows[$i].Removed) { $picked += $found[$i] } }
    $cleared = @($script:FoundRows | Where-Object { $_.Removed }).Count
    $d.Dispose()
    if ($cleared -gt 0) { $script:FoundHidden = $false; Update-FoundBar }
    if ([string]$res -ne "OK" -or $picked.Count -eq 0) { return }
    $mods = @(Load-Db)
    $taken = @{}; foreach ($m in $mods) { $taken[([string]$m.Name).ToLower()] = $true }
    foreach ($fm in $picked) {
        $name = Clean-Name (Get-FoundLabel $fm).Name
        if (-not $name) { $name = Clean-Name $fm.Name }
        if (-not $name) { $name = "Found mod" }
        $base = $name; $k = 2
        while ($taken.ContainsKey($name.ToLower())) { $name = "$base ($k)"; $k++ }
        $taken[$name.ToLower()] = $true
        $e = [pscustomobject]@{ Name = $name; Date = "Found " + (Get-Date).ToString("yyyy-MM-dd"); Files = @($fm.Files); Backups = @(); Enabled = $true; Found = $true }
        Import-ToLibrary $e        # keep its own copy, so on/off is safe
        $mods += $e
    }
    Save-Db $mods
    Refresh-Garage
    Update-FoundBar
    Set-Status "Added $($picked.Count) mod(s) to My Mods. Untick to turn one off, like any other mod." $C_GREEN
}
function Set-FoundRow([int]$i, [bool]$on) {
    $r = $script:FoundRows[$i]
    $r.On = $on
    $r.Check.Text = $(if ($on) { [string][char]0x2714 } else { "" })
    $r.Check.BackColor = $(if ($on) { $C_BLUE } else { [System.Drawing.Color]::FromArgb(58, 62, 70) })
    $r.Check.ForeColor = [System.Drawing.Color]::FromArgb(12, 16, 22)
    $r.Title.ForeColor = $(if ($on) { [System.Drawing.Color]::White } else { $C_DIM })
    Update-FoundCount
}
function Update-FoundCount {
    if (-not $script:FoundCount) { return }
    $left = @($script:FoundRows | Where-Object { -not $_.Removed })
    $on = @($left | Where-Object { $_.On }).Count
    $script:FoundCount.Text = $(if ($left.Count -eq 0) { "All cleared" } else { "$on of $($left.Count) ticked" })
}
# Clear: the files go to the Recycle Bin (you can get them back from there)
function Remove-ToRecycleBin($path) {
    try {
        Add-Type -AssemblyName Microsoft.VisualBasic -ErrorAction Stop
        [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($path, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)
    } catch { Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue }
}
function Clear-FoundRows([int[]]$idx) {
    $rows = @($idx | Where-Object { $_ -ge 0 -and $_ -lt $script:FoundRows.Count } | ForEach-Object { $script:FoundRows[$_] } | Where-Object { -not $_.Removed })
    if ($rows.Count -eq 0) { return }
    $n = 0; foreach ($r in $rows) { $n += @($r.Files).Count }
    $what = $(if ($rows.Count -eq 1) { "'" + $rows[0].Title.Text + "'" } else { "these " + $rows.Count + " items" })
    $ok = [System.Windows.Forms.MessageBox]::Show("Clear $what from your game folder?`n`n$n file(s) go to the Recycle Bin - you can restore them from there.", "Clear", "YesNo", "Question")
    if ($ok -ne "Yes") { return }
    foreach ($r in $rows) {
        foreach ($rel in @($r.Files)) {
            $p = Join-Path $script:Game ([string]$rel)
            if (Test-Path -LiteralPath $p) { Remove-ToRecycleBin $p; Remove-EmptyDirs (Split-Path $p -Parent) }
        }
        $r.Removed = $true; $r.On = $false
        $r.Row.Visible = $false; $r.Gap.Visible = $false
    }
    Update-FoundCount
    Set-Status "Cleared $n file(s) - they're in the Recycle Bin." $C_GREEN
}

$btnFind.Add_Click({
    Set-Status "Checking your game folder..." $C_DIM $false; $form.Refresh()
    Update-FoundBar
    Show-FoundMods
})
$btnReview.Add_Click({ Show-FoundMods })

# ============================================================================
#  Page: Settings
# ============================================================================
$pSet = $pages[$PG_SETTINGS]
$setBody = New-Panel "Fill" 0 $null
$setBody.AutoScroll = $true
$setBody.Tag = "glass"
$pSet.Controls.Add($setBody)
Add-Heading $pSet "Settings" "Set it once and forget it."

function Add-Section($y, $title) {
    $setBody.Controls.Add((New-Label $title 0 $y 700 24 $F_BIG ([System.Drawing.Color]::White)))
    $bar = New-Object System.Windows.Forms.Panel
    $bar.Location = New-Object System.Drawing.Point(0, ($y + 25)); $bar.Size = New-Object System.Drawing.Size(34, 3); $bar.BackColor = $C_BLUE
    $setBody.Controls.Add($bar)
}

Add-Section 0 "GTA IV folder"
$txtGame = New-Object System.Windows.Forms.TextBox
$txtGame.Location = New-Object System.Drawing.Point(0, 30); $txtGame.Size = New-Object System.Drawing.Size(620, 26)
$txtGame.ReadOnly = $true; $txtGame.BackColor = $C_PANEL2; $txtGame.ForeColor = $C_TEXT; $txtGame.BorderStyle = "FixedSingle"
$btnBrowse = New-Button "Change..." 630 27 110 30
$setBody.Controls.Add($txtGame); $setBody.Controls.Add($btnBrowse)

Add-Section 80 "Essentials"
$lblVer = New-Label "" 0 110 740 20 $F_BODY $C_DIM
# 1. Fusion Fix - opens its GitHub releases, you pick the version
$lblFF = New-Label "" 0 140 470 20 $F_BOLD $C_TEXT
$btnFF = New-Button "Get Fusion Fix" 480 135 200 30 $true
# small optional fixes that go with Fusion Fix
$lblFFOpt = New-Label "Optional:" 18 177 70 20 $F_SMALL $C_DIM
$btnRadio = New-Button "Fix Old Radio" 90 172 140 26
$btnBudget = New-Button "Fix Traffic Glitch" 238 172 150 26
$lblBudget = New-Label "" 398 177 340 20 $F_SMALL $C_DIM
# 2. ScriptHookDotNet (Nexus)
$lblShdn = New-Label "" 0 214 470 20 $F_BOLD $C_TEXT
$btnShdn = New-Button "Get ScriptHookDotNet" 480 209 200 30
# 3. DLSS-IV (Nexus)
$lblDlss = New-Label "" 0 250 470 20 $F_BOLD $C_TEXT
$btnDlss = New-Button "Get DLSS-IV" 480 245 200 30
$script:EssCtl = @($lblVer, $lblFF, $btnFF, $lblFFOpt, $btnRadio, $btnBudget, $lblBudget, $lblShdn, $btnShdn, $lblDlss, $btnDlss)
foreach ($c in $script:EssCtl) { $setBody.Controls.Add($c) }

Add-Section 256 "Downloads from your normal browser"
$chkWatch = New-Object System.Windows.Forms.CheckBox
$chkWatch.Text = "Pop up when a mod lands in my Downloads folder (Chrome, Edge, Firefox...)"
$chkWatch.Location = New-Object System.Drawing.Point(0, 284); $chkWatch.Size = New-Object System.Drawing.Size(740, 24)
$chkWatch.ForeColor = $C_TEXT; $chkWatch.Font = $F_BODY
$setBody.Controls.Add($chkWatch)
$setBody.Controls.Add((New-Label ("Watching: " + (Get-DownloadsFolder)) 18 308 720 20 $F_SMALL $C_DIM))

Add-Section 344 "Right-click install"
$btnMenuAdd = New-Button "Add 'Install with...' to Right-Click" 0 374 300 32
$btnMenuDel = New-Button "Remove It" 308 374 120 32
$setBody.Controls.Add($btnMenuAdd); $setBody.Controls.Add($btnMenuDel)
$z = Find-7z
$setBody.Controls.Add((New-Label ($(if ($z) { "7-Zip found: .rar and .7z mods open fine." } else { "Install 7-Zip (free, 7-zip.org) to open .rar and .7z mods. .zip and .oiv always work." })) 0 412 740 20 $F_BODY ($(if ($z) { $C_GREEN } else { $C_AMBER }))))

Add-Section 452 "Nexus Mods account (optional)"
$setBody.Controls.Add((New-Label "Not needed to download - just log in inside Get Mods. A key adds one-click 'Mod Manager Download' (and direct downloads for Premium)." 0 480 740 36 $F_BODY $C_DIM))
$txtKey = New-Object System.Windows.Forms.TextBox
$txtKey.Location = New-Object System.Drawing.Point(0, 520); $txtKey.Size = New-Object System.Drawing.Size(360, 26)
$txtKey.UseSystemPasswordChar = $true; $txtKey.BackColor = $C_PANEL2; $txtKey.ForeColor = $C_TEXT; $txtKey.BorderStyle = "FixedSingle"
$btnKey = New-Button "Save Key" 368 517 110 30
$lnkKey = New-Object System.Windows.Forms.LinkLabel
$lnkKey.Text = "Where do I get a key?"; $lnkKey.Location = New-Object System.Drawing.Point(488, 523); $lnkKey.Size = New-Object System.Drawing.Size(200, 20)
$lnkKey.LinkColor = $C_BLUE; $lnkKey.ActiveLinkColor = $C_TEXT
$lblNexus = New-Label "Not connected" 0 554 500 20 $F_BOLD $C_DIM
$btnNxm = New-Button "Handle 'Mod Manager Download' Buttons" 0 580 340 32
foreach ($c in @($txtKey, $btnKey, $lnkKey, $lblNexus, $btnNxm)) { $setBody.Controls.Add($c) }

Add-Section 632 "Where mods go"
$helpLines = @(
    "Models, textures and game files  ->  update\<Mod name>\   (your originals stay untouched)",
    "Game data files (.dat, .ide)  ->  update\common\data\   (Fusion Fix only reads them there)",
    "Scripts (.cs, .net.dll)  ->  scripts\",
    "Plugins (.asi) and helper .dll files  ->  the game folder",
    "Loose models (.wft .wtd .wdr ...)  ->  packed into update\<Mod name>\<modname>.img",
    "Files inside game archives (like playerped.rpf)  ->  a modded copy in update\LC Installer Archives\",
    "Anything replaced is backed up, and put back when you turn a mod off or uninstall it."
)
for ($i = 0; $i -lt $helpLines.Count; $i++) { $setBody.Controls.Add((New-Label $helpLines[$i] 0 (660 + $i * 14) 900 22 $F_BODY $C_DIM)) }

Add-Section 760 "Storage"
$lblStore = New-Label "" 0 790 460 20 $F_BODY $C_DIM
$btnClearDl = New-Button "Clear Downloaded Files" 480 785 200 30
$setBody.Controls.Add($lblStore); $setBody.Controls.Add($btnClearDl)
$setBody.Controls.Add((New-Label "Installed mods are not affected - only the copies kept after downloading." 0 816 740 20 $F_SMALL $C_DIM))
Add-Section 856 "Look"
$setBody.Controls.Add((New-Label "The app plays its own background video. Change it with a live or game wallpaper, or pick a plain color." 0 884 740 20 $F_BODY $C_DIM))
function New-Combo($x, $y, $w, $items) {
    $c = New-Object System.Windows.Forms.ComboBox
    $c.DropDownStyle = "DropDownList"; $c.FlatStyle = $(if ($script:UI) { "Standard" } else { "Flat" }); $c.BackColor = $C_PANEL2; $c.ForeColor = $C_TEXT; $c.Font = $F_BODY
    $c.Location = New-Object System.Drawing.Point($x, $y); $c.Size = New-Object System.Drawing.Size($w, 26)
    foreach ($i in $items) { [void]$c.Items.Add($i) }
    return $c
}
$LOOK_TARGETS = @(@("all", "All pages"), @("get", "Get Mods page"), @("install", "Install page"), @("mine", "My Mods page"), @("settings", "Settings page"),
                  @("nav", "Side menu"), @("header", "Top bar"), @("status", "Bottom bar"), @("lists", "Lists"))
$LOOK_DIMS = @(0, 25, 50, 75)
$LOOK_FITS = @("Fill", "Fit", "Tile", "Center")
$setBody.Controls.Add((New-Label "Change" 0 919 70 20 $F_BODY $C_TEXT))
$cmbLook = New-Combo 80 915 190 @($LOOK_TARGETS | ForEach-Object { $_[1] })
$btnLookColor = New-Button "Pick Color..." 0 954 132 30
$btnLookImage = New-Button "Picture / Video..." 138 954 150 30
$btnLookNoImg = New-Button "Remove Background" 138 954 150 30
$btnLookReset = New-Button "Reset" 0 990 132 30
$btnLive = New-Button "Live Wallpapers..." 300 954 160 30
$btnGameWall = New-Button "Game Wallpapers..." 300 990 160 30
$setBody.Controls.Add((New-Label "Picture darkness" 0 1032 120 20 $F_BODY $C_TEXT))
$cmbDim = New-Combo 124 1028 70 @($LOOK_DIMS | ForEach-Object { "$_%" })
$setBody.Controls.Add((New-Label "Fit" 206 1032 30 20 $F_BODY $C_TEXT))
$cmbFit = New-Combo 236 1028 90 $LOOK_FITS
$lookSwatch = New-Object System.Windows.Forms.Panel
$lookSwatch.Location = New-Object System.Drawing.Point(350, 915); $lookSwatch.Size = New-Object System.Drawing.Size(200, 140)
$lookSwatch.BorderStyle = "FixedSingle"; $lookSwatch.BackgroundImageLayout = "Zoom"
foreach ($c in @($cmbLook, $btnLookColor, $btnLookNoImg, $btnLookReset, $cmbDim, $cmbFit, $btnLive, $btnGameWall)) { $setBody.Controls.Add($c) }   # (no preview box, no Picture/Video button)
$setBody.Controls.Add((New-Label "Opens free live wallpaper sites in Get Mods - download a video and it becomes your background." 470 960 290 60 $F_SMALL $C_DIM))
$setBody.Controls.Add((New-Label "Saved on this PC. A darker picture keeps text easy to read." 0 1052 740 20 $F_SMALL $C_DIM))
$chkAnim = New-Object System.Windows.Forms.CheckBox
$chkAnim.Text = "Smooth animations (turn off on a slow PC)"; $chkAnim.Font = $F_BODY; $chkAnim.ForeColor = $C_TEXT
$chkAnim.Location = New-Object System.Drawing.Point(0, 1076); $chkAnim.Size = New-Object System.Drawing.Size(400, 24); $chkAnim.Checked = $true
$chkAnim.Enabled = $script:UI
$setBody.Controls.Add($chkAnim)
$ey = 1110   # footer sits under the last setting
foreach ($c in @($setBody.Controls)) { if ($c.Top -ge 250 -and $script:EssCtl -notcontains $c) { $c.Top += 44 } }   # room for the Essentials rows
foreach ($c in @($setBody.Controls)) { $c.Left += 18; $c.Top += 14 }   # inner margin inside the dark panel
$ey += 44
$setBody.Controls.Add((New-Label "Liberty City Mod Loader IV $APP_VERSION  -  for GTA IV: The Complete Edition with Fusion Fix" 18 ($ey + 30) 740 22 $F_SMALL $C_DIM))
$setBody.Controls.Add((New-Label " " 0 ($ey + 38) 10 20 $F_SMALL $C_DIM))
# scrolling over a picture: repaint so nothing smears
$setBody.Add_Scroll({ $setBody.Invalidate($true) })
$setBody.Add_MouseWheel({ $setBody.Invalidate($true) })

# ----------------------------------------------------------------------------
#  Look: backgrounds (kept in %APPDATA%\LibertyCityModInstaller, same for every game folder)
# ----------------------------------------------------------------------------
$script:Look = @{}
$script:LookImages = @{}
$LOOK_DEFAULT = @{ get = $C_BG; install = $C_BG; mine = $C_BG; settings = $C_BG; nav = $C_NAV
                   header = [System.Drawing.Color]::Black; status = [System.Drawing.Color]::Black; lists = $C_PANEL2 }
function Get-LookDir {
    $d = Join-Path ([Environment]::GetFolderPath("ApplicationData")) "LibertyCityModInstaller"
    if (-not (Test-Path $d)) { New-Item -ItemType Directory $d -Force | Out-Null }
    return $d
}
function Load-Look {
    $script:Look = @{}
    $p = Join-Path (Get-LookDir) "look.json"
    if (Test-Path $p) {
        try { $j = Get-Content $p -Raw | ConvertFrom-Json; foreach ($prop in $j.PSObject.Properties) { $script:Look[$prop.Name] = $prop.Value } } catch { }
    }
}
function Save-Look { try { $script:Look | ConvertTo-Json -Depth 4 | Set-Content (Join-Path (Get-LookDir) "look.json") -Encoding UTF8 } catch { } }
function Get-LookEntry($key) {
    if (-not $script:Look.ContainsKey($key) -or -not $script:Look[$key]) { $script:Look[$key] = [pscustomobject]@{ Color = ""; Image = ""; Dim = 50; Fit = "Fill" } }
    $e = $script:Look[$key]
    $names = @($e.PSObject.Properties | ForEach-Object { $_.Name })
    if ($names -notcontains "Color") { $e | Add-Member -NotePropertyName Color -NotePropertyValue "" }
    if ($names -notcontains "Image") { $e | Add-Member -NotePropertyName Image -NotePropertyValue "" }
    if ($names -notcontains "Dim")   { $e | Add-Member -NotePropertyName Dim -NotePropertyValue 50 }
    if ($names -notcontains "Fit")   { $e | Add-Member -NotePropertyName Fit -NotePropertyValue "Fill" }
    if ($names -notcontains "NoDefault") { $e | Add-Member -NotePropertyName NoDefault -NotePropertyValue $false }
    return $e
}
function Get-LookControl($key) {
    switch ($key) {
        "get" { return $pages[$PG_GET] } "install" { return $pages[$PG_INSTALL] } "mine" { return $pages[$PG_MINE] } "settings" { return $pages[$PG_SETTINGS] }
        "nav" { return $nav } "header" { return $header } "status" { return $status }
    }
    return $null
}
# the app's own background video (all pages) - used unless you pick a wallpaper or press Remove Background
$DEFAULT_BG = Join-Path (Join-Path $APP_DIR "art") "default-bg.mp4"
function Get-LookImagePath($key) {
    $e = Get-LookEntry $key
    if ($e.Image -and (Test-Path -LiteralPath ([string]$e.Image))) { return [string]$e.Image }
    if (@("get", "install", "mine", "settings") -contains $key -and -not $e.NoDefault -and (Test-Path -LiteralPath $DEFAULT_BG)) { return $DEFAULT_BG }
    return ""
}
function Get-LookColor($key) {
    $e = Get-LookEntry $key
    if ($e.Color) { try { return [System.Drawing.ColorTranslator]::FromHtml([string]$e.Color) } catch { } }
    return $LOOK_DEFAULT[$key]
}
# load a picture without locking the file, shrink big ones, darken it for readable text
function Get-LookBitmap($path, [int]$dim) {
    $ms = New-Object System.IO.MemoryStream(, [System.IO.File]::ReadAllBytes($path))
    $src = [System.Drawing.Image]::FromStream($ms)
    try {
        $scale = [math]::Min(1.0, 1920.0 / [math]::Max(1, $src.Width))
        $bw = [int][math]::Max(1, $src.Width * $scale); $bh = [int][math]::Max(1, $src.Height * $scale)
        $bmp = New-Object System.Drawing.Bitmap($bw, $bh)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        [void]$g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $bw, $bh)))
        if ($dim -gt 0) {
            $br = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb([int](255 * $dim / 100), 0, 0, 0))
            [void]$g.FillRectangle($br, 0, 0, $bw, $bh); [void]$br.Dispose()
        }
        [void]$g.Dispose()
        return $bmp
    } finally { [void]$src.Dispose(); [void]$ms.Dispose() }
}
# panels without their own color see through to the page picture
$C_GLASS = [System.Drawing.Color]::FromArgb(222, 12, 13, 16)
# over a video the dark layer shows a darkened copy of the video (made once per picture, so it costs almost nothing)
$C_GLASS_SOLID = [System.Drawing.Color]::FromArgb(255, 16, 17, 20)
$script:GlassSolid = $false    # dark see-through layer behind text over pictures/videos
function Set-Follow($root, [bool]$clear) {
    foreach ($c in $root.Controls) {
        if ($c.Tag -eq "follow") {
            $hasText = @($c.Controls | Where-Object { ($_ -is [System.Windows.Forms.Label] -or $_ -is [System.Windows.Forms.CheckBox]) -and $_.Text }).Count -gt 0
            $c.BackColor = $(if (-not $clear) { [System.Drawing.Color]::Empty } elseif ($hasText) { $(if ($script:GlassSolid) { $C_GLASS_SOLID } else { $C_GLASS }) } else { [System.Drawing.Color]::Transparent })
            if ($hasText -and $clear -and $script:GlassSolid -and $script:UI) { try { [LCMI.Glass]::Attach($c) } catch { } }
        }
        elseif ($c.Tag -eq "glass") {
            $c.BackColor = $(if (-not $clear) { [System.Drawing.Color]::Empty } elseif ($script:GlassSolid) { $C_GLASS_SOLID } else { $C_GLASS })
            if ($script:GlassSolid -and $script:UI) { try { [LCMI.Glass]::Attach($c) } catch { } }
        }
        if ($c.Controls.Count -gt 0 -and -not ($c -is [System.Windows.Forms.ListView])) { Set-Follow $c $clear }
    }
}
function Apply-LookTarget($key) {
    $e = Get-LookEntry $key
    $color = Get-LookColor $key
    if ($key -eq "lists") { foreach ($l in @($lvPlan, $lvGarage)) { if ($l) { $l.BackColor = $color } }; return }
    $ctl = Get-LookControl $key
    if (-not $ctl) { return }
    $lookSwatch.BackgroundImage = $null
    $ctl.BackColor = $color
    if ($script:UI) { try { [LCMI.Motion]::Stop($key) } catch { }; try { [LCMI.Bg]::Detach($ctl) } catch { } }
    $ctl.BackgroundImage = $null
    if ($script:LookImages.ContainsKey($key)) { $script:LookImages[$key].Dispose(); $script:LookImages.Remove($key) }
    $img = $null; $moving = $false
    $bgPath = Get-LookImagePath $key
    if ($bgPath) {
        $moving = $script:UI -and [LCMI.Motion]::IsMoving($bgPath)
        if ($moving) {
            # animated GIF or video: plays muted and loops
            try { $dbg = Join-Path $APP_DIR "video-timing.debug"; if ((Test-Path $dbg) -and ((Get-Content $dbg -Raw) -match 'on')) { [LCMI.Motion]::LogPath = Join-Path $APP_DIR "video-timing.log" } } catch { }
            # the app's own video: always shown whole (dark zoomed copy on the sides), so nothing is cut off on wide screens
            $fit = $(if ($bgPath -eq $DEFAULT_BG) { "Fit" } else { [string]$e.Fit })
            try { $img = [LCMI.Motion]::Start($key, $ctl, $bgPath, [int]$e.Dim, $fit) } catch { $img = $null }
            if (-not $img) { Set-Status ("Can't play that background: " + [LCMI.Motion]::LastError) $C_RED }
        } else { try { $img = Get-LookBitmap $bgPath ([int]$e.Dim) } catch { $img = $null } }
    }
    if ($img) {
        if (-not $moving) { $script:LookImages[$key] = $img }
        if (-not $moving -and $script:UI) {
            # made once at the window's size - much faster to draw than stretching the picture every time
            [LCMI.Bg]::Attach($ctl, $img, [string]$e.Fit)
        } else {
            $ctl.BackgroundImage = $img
            $ctl.BackgroundImageLayout = $(if ($moving) { "None" } else { switch ([string]$e.Fit) { "Fit" { "Zoom" } "Tile" { "Tile" } "Center" { "Center" } default { "Stretch" } } })
        }
    }
    $has = ($null -ne $img)
    if ($key -eq "nav") {
        $script:NavIdle = $(if ($has) { [System.Drawing.Color]::Transparent } else { $color })
        for ($k = 0; $k -lt 4; $k++) { if ($k -ne $script:CurrentPage) { $navButtons[$k].BackColor = $script:NavIdle } }
    }
    elseif ($key -in @("get", "install", "mine", "settings")) { $script:GlassSolid = $moving; Set-Follow $ctl $has; $script:GlassSolid = $false }
    $ctl.Invalidate($true)
}
function Get-LookKeys {
    $i = [math]::Max(0, $cmbLook.SelectedIndex)
    $k = $LOOK_TARGETS[$i][0]
    if ($k -eq "all") { return @("get", "install", "mine", "settings") }
    return @($k)
}
function Refresh-LookUi {
    $key = @(Get-LookKeys)[0]
    $e = Get-LookEntry $key
    $isList = ($key -eq "lists")
    $script:LookUiBusy = $true
    $cmbDim.SelectedIndex = [math]::Max(0, [array]::IndexOf($LOOK_DIMS, [int]$e.Dim))
    $cmbFit.SelectedIndex = [math]::Max(0, [array]::IndexOf($LOOK_FITS, [string]$e.Fit))
    $script:LookUiBusy = $false
    $hasBg = [bool](Get-LookImagePath $key)
    $btnLookNoImg.Enabled = (-not $isList) -and $hasBg
    $cmbDim.Enabled = (-not $isList) -and $hasBg
    $cmbFit.Enabled = (-not $isList) -and $hasBg
    $lookSwatch.BackColor = Get-LookColor $key
    $lc = Get-LookControl $key
    $lookSwatch.BackgroundImage = $(if ($script:LookImages.ContainsKey($key)) { $script:LookImages[$key] } elseif ($lc -and $lc.BackgroundImage) { $lc.BackgroundImage } else { $null })
}
function Clean-LookFiles {
    $used = @($script:Look.Values | ForEach-Object { if ($_ -and ($_.PSObject.Properties.Name -contains "Image") -and $_.Image) { [string]$_.Image } })
    Get-ChildItem (Get-LookDir) -Filter "bg-*" -File -ErrorAction SilentlyContinue | Where-Object { $used -notcontains $_.FullName } | Remove-Item -Force -ErrorAction SilentlyContinue
}
function Update-Look($change) {
    foreach ($k in @(Get-LookKeys)) { $e = Get-LookEntry $k; & $change $e; Apply-LookTarget $k }
    Save-Look
    Clean-LookFiles
    Refresh-LookUi
}
$cmbLook.Add_SelectedIndexChanged({ Refresh-LookUi })
$chkAnim.Add_CheckedChanged({
    if ($script:LookUiBusy) { return }
    $script:Look["anim"] = [pscustomobject]@{ Color = ""; Image = ""; Dim = 0; Fit = "Fill"; On = [bool]$chkAnim.Checked }
    if ($script:UI) { [LCMI.Anim]::Enabled = [bool]$chkAnim.Checked }
    Save-Look
})
$btnLookColor.Add_Click({
    $d = New-Object System.Windows.Forms.ColorDialog
    $d.FullOpen = $true; $d.Color = Get-LookColor (@(Get-LookKeys)[0])
    if ($d.ShowDialog() -ne "OK") { return }
    $hex = "#{0:X2}{1:X2}{2:X2}" -f $d.Color.R, $d.Color.G, $d.Color.B
    Update-Look { param($e) $e.Color = $hex }
    Set-Status "New paint job applied." $C_GREEN
})
$btnLookImage.Add_Click({
    $d = New-Object System.Windows.Forms.OpenFileDialog
    $d.Title = "Pick a background picture, GIF or video"
    $d.Filter = "Pictures, GIFs and videos|*.jpg;*.jpeg;*.png;*.bmp;*.gif;*.mp4;*.wmv;*.avi;*.mov;*.m4v;*.mkv;*.webm|Pictures (*.jpg, *.png, *.bmp)|*.jpg;*.jpeg;*.png;*.bmp|Animated GIFs (*.gif)|*.gif|Videos (*.mp4, *.wmv, *.avi, *.mov)|*.mp4;*.wmv;*.avi;*.mov;*.m4v;*.mkv;*.webm|All files|*.*"
    if ($d.ShowDialog() -ne "OK") { return }
    $isVideo = $d.FileName -match '(?i)\.(mp4|wmv|avi|mov|m4v|mkv|webm)$'
    if (-not $isVideo) { try { $test = Get-LookBitmap $d.FileName 0; $test.Dispose() } catch { Set-Status "Windows can't open that file as a picture. Try a .jpg or .png." $C_RED; return } }
    elseif ((Get-Item -LiteralPath $d.FileName).Length -gt 300MB) { Set-Status "That video is very big (over 300 MB). Pick a shorter one." $C_RED; return }
    $dest = Join-Path (Get-LookDir) ("bg-" + [guid]::NewGuid().ToString("N").Substring(0, 8) + [IO.Path]::GetExtension($d.FileName).ToLower())
    Copy-Item -LiteralPath $d.FileName -Destination $dest -Force
    Update-Look { param($e) $e.Image = $dest }
    $what = $(if ($isVideo) { "video (muted, loops)" } elseif ($script:UI -and [LCMI.Motion]::IsMoving($dest)) { "GIF" } else { "picture" })
    if ((Get-LookEntry (@(Get-LookKeys)[0])).Image) { Set-Status "Background $what set. Change 'Picture darkness' if text is hard to read." $C_GREEN }
})
$btnLookNoImg.Add_Click({ Update-Look { param($e) $e.Image = ""; $e.NoDefault = $true }; Set-Status "Background removed - plain color now. Reset brings the app's video back." $C_DIM })
# live wallpapers: free video sites open in Get Mods; a downloaded video is offered as the background
$btnLive.Add_Click({ Open-Browser "https://www.pexels.com/search/videos/night%20city/"; Set-Status "Pick a video, press Free download - it becomes your background. Search for anything you like." $C_AMBER })
$btnGameWall.Add_Click({ Open-Browser "https://moewalls.com/?s=gta"; Set-Status "Open a wallpaper and press Download - it becomes your background." $C_AMBER })
function Set-LiveWallpaper([string]$path) {
    $r = [System.Windows.Forms.MessageBox]::Show("Use this video as the background for all pages?`n`n(It plays with no sound and loops. Change 'Picture darkness' in Settings > Look if text is hard to read.)", "Live wallpaper", "YesNo", "Question")
    if ($r -ne "Yes") { Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue; Set-Status "Not used - the video was deleted." $C_DIM; return }
    $cmbLook.SelectedIndex = 0      # All pages
    Update-Look { param($e) $e.Image = $path }
    Set-Status "Live wallpaper set." $C_GREEN
}
$btnLookReset.Add_Click({ Update-Look { param($e) $e.Color = ""; $e.Image = ""; $e.Dim = 50; $e.Fit = "Fill"; $e.NoDefault = $false }; Set-Status "Back to the original look (the app's background video)." $C_DIM })
$cmbDim.Add_SelectedIndexChanged({ if ($script:LookUiBusy -or $cmbDim.SelectedIndex -lt 0) { return }; $v = $LOOK_DIMS[$cmbDim.SelectedIndex]; Update-Look { param($e) $e.Dim = $v } })
$cmbFit.Add_SelectedIndexChanged({ if ($script:LookUiBusy -or $cmbFit.SelectedIndex -lt 0) { return }; $v = $LOOK_FITS[$cmbFit.SelectedIndex]; Update-Look { param($e) $e.Fit = $v } })

function Refresh-Storage {
    $dl = $(if ($script:Game) { Join-Path (Get-DataDir) "downloads" } else { "" })
    $mb = 0
    if ($dl -and (Test-Path $dl)) { $mb = [math]::Round(((Get-ChildItem $dl -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum) / 1MB, 1) }
    $lblStore.Text = "Downloaded mod files: $mb MB"
    $btnClearDl.Enabled = ($mb -gt 0)
}
$btnClearDl.Add_Click({ if (-not $script:Game) { Show-Page $PG_SETTINGS; Set-Status "Pick your GTA IV folder first - click Change... below." $C_RED; return }; 
    $dl = Join-Path (Get-DataDir) "downloads"
    if (Test-Path $dl) { Get-ChildItem $dl -File | Remove-Item -Force -ErrorAction SilentlyContinue }
    Refresh-Storage
    Set-Status "Downloaded files cleared." $C_GREEN
})

function Refresh-Essentials {
    if (-not $script:Game) { $lblVer.Text = ""; $lblFF.Text = ""; $lblBudget.Text = ""; $lblShdn.Text = ""; $lblDlss.Text = ""; return }
    $v = Get-GameVersion
    $lblVer.Text = "Game version: " + $(if ($v) { [string]$v + $(if (Test-CompleteEdition) { "  (Complete Edition)" } else { "  (older version)" }) } else { "unknown" })

    $asi = Join-Path $script:Game "plugins\GTAIV.EFLC.FusionFix.asi"
    if (Test-Path $asi) {
        $fv = (Get-Item $asi).VersionInfo.ProductVersion
        $lblFF.Text = "Fusion Fix: installed" + $(if ($fv) { "  (v" + $fv.Trim() + ")" } else { "" }); $lblFF.ForeColor = $C_GREEN
    } else { $lblFF.Text = "Fusion Fix: not installed - most mods need it"; $lblFF.ForeColor = $C_RED }

    $vb = Get-FFIniValue "VehicleBudget"
    if ($null -eq $vb) { $lblBudget.Text = "Traffic fix needs Fusion Fix"; $btnBudget.Enabled = $false }
    elseif ($vb -eq "0" -or $vb -eq "") { $lblBudget.Text = "Traffic: same cars may repeat"; $btnBudget.Enabled = $true }
    else { $lblBudget.Text = "Traffic: fixed (budget $vb)"; $btnBudget.Enabled = $true }

    $shdn = (Test-Path (Join-Path $script:Game "ScriptHookDotNet.asi")) -or (Test-Path (Join-Path $script:Game "plugins\ScriptHookDotNet.asi"))
    if ($shdn) { $lblShdn.Text = "ScriptHookDotNet: installed (.cs and .net.dll scripts work)"; $lblShdn.ForeColor = $C_GREEN }
    else { $lblShdn.Text = "ScriptHookDotNet: not installed - script mods won't run"; $lblShdn.ForeColor = $C_AMBER }

    $dlss = (Test-Path (Join-Path $script:Game "DLSS-IV.asi")) -or (Test-Path (Join-Path $script:Game "plugins\DLSS-IV.asi"))
    if ($dlss) { $lblDlss.Text = "DLSS-IV: installed (settings in DLSS-IV.cfg)"; $lblDlss.ForeColor = $C_GREEN }
    else { $lblDlss.Text = "DLSS-IV: not installed - DLSS / FSR sharp picture and more FPS"; $lblDlss.ForeColor = $C_DIM }
}

function Refresh-NexusUi {
    if (Test-NxmRegistered) { $btnNxm.Text = "Stop Handling Nexus Download Buttons" } else { $btnNxm.Text = "Handle 'Mod Manager Download' Buttons" }
    if (-not (Get-NexusKey)) { $lblNexus.Text = "No key saved"; $lblNexus.ForeColor = $C_DIM; return }
    try {
        $me = Invoke-Nexus "users/validate.json"
        $lblNexus.Text = "Connected as " + $me.name + $(if ($me.is_premium) { " (Premium)" } else { " (Free)" })
        $lblNexus.ForeColor = $C_GREEN
    } catch { $lblNexus.Text = "Key not accepted - check it"; $lblNexus.ForeColor = $C_RED }
}

$btnBrowse.Add_Click({
    $d = New-Object System.Windows.Forms.FolderBrowserDialog
    $d.Description = "Choose the folder that contains GTAIV.exe"
    if ($d.ShowDialog() -eq "OK") { Set-Game $d.SelectedPath }
})
$lblGame.Add_LinkClicked({ Show-Page $PG_SETTINGS })
# opens the pages in Get Mods - you pick the version and press its download button, then it opens in Install
$btnFF.Add_Click({ Open-Browser "https://github.com/ThirteenAG/GTAIV.EFLC.FusionFix/releases" })
$btnRadio.Add_Click({
    Open-Browser "https://github.com/Tomasak/GTA-Downgraders/releases/iv-latest"
    Set-Status "Download 'Radio.Restoration.Mod' zip, extract it to an empty folder and run IVCERadioRestorer.exe." $C_AMBER
})
$btnDlss.Add_Click({ Open-Browser "https://www.nexusmods.com/gta4/mods/1430?tab=files" })
$btnBudget.Add_Click({ if (-not $script:Game) { Show-Page $PG_SETTINGS; Set-Status "Pick your GTA IV folder first - click Change... below." $C_RED; return }; 
    $vb = Get-FFIniValue "VehicleBudget"
    $new = $(if ($vb -eq "0" -or $vb -eq "") { "144000000" } else { [string]([int64]$vb + 20000000) })
    $r = [System.Windows.Forms.MessageBox]::Show("Set Fusion Fix's vehicle budget to $new?`n`nMore variety in traffic. If engine sounds go missing or a cutscene loads forever, it's too high - lower it in plugins\GTAIV.EFLC.FusionFix.ini.", "Traffic variety", "YesNo", "Question")
    if ($r -eq "Yes") {
        if (Set-FFIniValue "VehicleBudget" $new) { Set-Status "Vehicle budget set to $new. Restart the game to see it." $C_GREEN } else { Set-Status "Couldn't find VehicleBudget in the Fusion Fix settings." $C_RED }
        Refresh-Essentials
    }
})
$btnShdn.Add_Click({ Open-Browser "https://www.nexusmods.com/gta4/mods/1217?tab=files" })
$chkWatch.Add_CheckedChanged({ Set-Watch $chkWatch.Checked })
$btnMenuAdd.Add_Click({ Add-ContextMenu })
$btnMenuDel.Add_Click({ Remove-ContextMenu })
$lnkKey.Add_LinkClicked({ Start-Process "https://www.nexusmods.com/users/myaccount?tab=api" })
$btnKey.Add_Click({
    if (-not $script:Game) { Set-Status "Pick your GTA IV folder first." $C_RED; return }
    Set-NexusKey $txtKey.Text.Trim(); $txtKey.Text = ""
    Refresh-NexusUi
})
$btnNxm.Add_Click({
    if (Test-NxmRegistered) { Unregister-Nxm }
    else {
        $r = [System.Windows.Forms.MessageBox]::Show("Nexus 'Mod Manager Download' buttons will open this installer instead of Vortex or Mod Organizer (for every game on Nexus). You can switch back here any time.`n`nContinue?", "Nexus Mods", "YesNo", "Question")
        if ($r -eq "Yes") { Register-Nxm }
    }
    Refresh-NexusUi
})

# ----------------------------------------------------------------------------
#  Start
# ----------------------------------------------------------------------------
function Set-Game($path) {
    if ($path -and (Test-Path (Join-Path $path "GTAIV.exe"))) {
        $script:Game = $path; $txtGame.Text = $path; $script:RpfIndex = $null; $script:ArcKey = $null; $script:GameFileIndex = $null; $script:ArcIndex = $null
        $lblGame.Text = "GTA IV found  -  Change"; $lblGame.LinkColor = $C_GREEN
        Load-Settings
        $t = Join-Path (Get-DataDir) "temp"
        if (Test-Path $t) { Remove-Item $t -Recurse -Force -ErrorAction SilentlyContinue }   # leftovers from a previous session
        try { Convert-ToLibrary } catch { try { Add-Content -Path (Join-Path $env:TEMP "LibertyCityModInstaller.log") -Value ((Get-Date).ToString("s") + "  library: " + $_.ToString()) } catch { } }
        Repair-ImgArchives
        try { Rename-OldImgs } catch { }
        try { Move-DataFiles } catch { }
        try { Move-KeyedData } catch { }
        # put back any mod file that went missing from the game folder
        try { $mm = @(Load-Db | Where-Object { Test-InLibrary $_ }); if ($mm.Count -gt 0) { Sync-Files (Get-AllModFiles $mm) @(Load-Db) } } catch { }
        try { Update-ArchivesIfStale } catch { }
        Refresh-Garage
        Refresh-Essentials
        return $true
    }
    $script:Game = ""; $txtGame.Text = "Not found - click Change... and pick the folder with GTAIV.exe"
    $lblGame.Text = "GTA IV not found  -  Set it up"; $lblGame.LinkColor = $C_RED
    Refresh-Essentials
    return $false
}


# ============================================================================
#  Background music: your own music folder, or the YouTube Music app (API Server plugin)
# ============================================================================
$YTM_CLIENT = "LibertyCityModInstaller"
function Get-MusicSettings {
    if (-not ($script:Look.ContainsKey("music") -and $script:Look["music"])) { $script:Look["music"] = [pscustomobject]@{} }
    $m = $script:Look["music"]
    $defaults = [ordered]@{ Source = "Off"; Folder = ""; Volume = 40; Token = ""; Port = 26538; AutoPlay = $true }
    foreach ($k in $defaults.Keys) { if (-not ($m.PSObject.Properties.Name -contains $k)) { $m | Add-Member -NotePropertyName $k -NotePropertyValue $defaults[$k] } }
    return $m
}
function Set-NowPlaying([string]$t) { $lblNow.Text = $t; if ($script:MusicNow) { $script:MusicNow.Text = $(if ($t) { $t } else { "Nothing playing" }) } }

# ---- your own music (mp3, wav, wma, m4a, aac, flac) ----
$script:Mp = $null; $script:Playlist = @(); $script:TrackAt = 0; $script:LocalPlaying = $false; $script:FailRun = 0
function Init-LocalPlayer {
    if ($script:Mp) { return $true }
    try {
        Add-Type -AssemblyName PresentationCore -ErrorAction Stop
        $script:Mp = New-Object System.Windows.Media.MediaPlayer
        $script:Mp.Add_MediaEnded({ $script:FailRun = 0; Play-Track ($script:TrackAt + 1) })
        $script:Mp.Add_MediaOpened({ $script:FailRun = 0 })
        $script:Mp.Add_MediaFailed({ $script:FailRun++; if ($script:FailRun -lt $script:Playlist.Count) { Play-Track ($script:TrackAt + 1) } else { Set-NowPlaying "Can't play the files in that folder" } })
        return $true
    } catch { Set-Status "Windows can't play music here: $($_.Exception.Message)" $C_RED; return $false }
}
function Load-Playlist {
    $f = (Get-MusicSettings).Folder
    $script:Playlist = @()
    if ($f -and (Test-Path -LiteralPath $f)) {
        $script:Playlist = @(Get-ChildItem -LiteralPath $f -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -match '(?i)^\.(mp3|wav|wma|m4a|aac|flac)$' } | Sort-Object { Get-Random } | ForEach-Object { $_.FullName })
    }
    $script:TrackAt = 0
}
function Play-Track([int]$i) {
    if (-not (Init-LocalPlayer)) { return }
    $n = $script:Playlist.Count
    if ($n -eq 0) { Set-NowPlaying "No music found - choose a folder"; return }
    $i = (($i % $n) + $n) % $n
    $script:TrackAt = $i
    $script:Mp.Open([Uri]$script:Playlist[$i])
    $script:Mp.Volume = [double](Get-MusicSettings).Volume / 100
    $script:Mp.Play()
    $script:LocalPlaying = $true
    Set-NowPlaying ([string][char]0x266A + "  " + [IO.Path]::GetFileNameWithoutExtension($script:Playlist[$i]))
}
function Stop-Local { if ($script:Mp) { $script:Mp.Stop(); $script:Mp.Close() }; $script:LocalPlaying = $false }

# ---- YouTube Music app (Plugins > API Server [Beta] must be on) ----
function Ytm-Base { return "http://127.0.0.1:" + [int](Get-MusicSettings).Port }
# talking to it happens on a background thread (LCMI.Ytm), so the window never freezes while it waits
function Ytm-Sync {
    if (-not $script:UI) { return }
    $ms = Get-MusicSettings
    [LCMI.Ytm]::BaseUrl = Ytm-Base
    [LCMI.Ytm]::Token = [string]$ms.Token
}
function Ytm-Call($method, $path, $body = $null) {
    if (-not $script:UI) { return }
    Ytm-Sync
    $json = $(if ($body) { $body | ConvertTo-Json -Compress } else { $null })
    [LCMI.Ytm]::Send($method.ToUpper(), $path, $json)
}
function Ytm-Connect {
    if (-not $script:UI) { Set-Status "YouTube Music needs the app's UI library, which couldn't load." $C_RED; return $false }
    Ytm-Sync
    [LCMI.Ytm]::Auth($YTM_CLIENT)
    $script:YtmAuthWait = $true
    Set-Status "Connecting... if YouTube Music asks, click Allow." $C_AMBER $false
    $musicTimer.Enabled = $true
    return $true
}
$script:YtmSeen = -1
# reads what the background thread found (cheap - runs every second)
function Ytm-Refresh {
    if (-not $script:UI) { return }
    if ($script:YtmAuthWait) {
        $st = [LCMI.Ytm]::AuthState
        if ($st -eq 2) {
            $script:YtmAuthWait = $false
            (Get-MusicSettings).Token = [string][LCMI.Ytm]::NewToken; Save-Look
            Set-Status "Connected to YouTube Music." $C_GREEN
            try { Update-MusicPanel } catch { }
            [LCMI.Ytm]::Start(); [LCMI.Ytm]::Refresh()
        } elseif ($st -eq 3) {
            $script:YtmAuthWait = $false
            Set-Status "Couldn't reach YouTube Music. Open it, then Plugins > API Server [Beta] > Enabled, and try again." $C_RED
        }
    }
    $v = [LCMI.Ytm]::Version
    if ($v -eq $script:YtmSeen) { return }
    $script:YtmSeen = $v
    $code = [LCMI.Ytm]::LastCode
    if ($code -eq 401 -or $code -eq 403) { (Get-MusicSettings).Token = ""; Set-NowPlaying "YouTube Music: press Connect"; return }
    if ($code -eq -1) { Set-NowPlaying "YouTube Music isn't open"; return }
    if ($code -ne 0) { return }
    $song = $null
    try { $song = [LCMI.Ytm]::SongJson | ConvertFrom-Json } catch { }
    if ($song -and $song.title) {
        $state = $(if ($song.isPaused) { "Paused  -  " } else { [string][char]0x266A + "  " })
        Set-NowPlaying ($state + $song.title + $(if ($song.artist) { "  -  " + $song.artist } else { "" }))
    } else { Set-NowPlaying "YouTube Music: nothing playing" }
}
function Ytm-Begin { if (-not $script:UI) { return }; Ytm-Sync; [LCMI.Ytm]::Start(); [LCMI.Ytm]::Refresh(); $musicTimer.Enabled = $true }
$musicTimer = New-Object System.Windows.Forms.Timer
$musicTimer.Interval = 1000
$musicTimer.Add_Tick({ if ((Get-MusicSettings).Source -eq "YouTube Music" -or $script:YtmAuthWait) { Ytm-Refresh } })

# ---- one set of buttons for both ----
function Music-Toggle {
    $ms = Get-MusicSettings
    switch ($ms.Source) {
        "My music" {
            if (-not $script:Mp -or $script:Playlist.Count -eq 0) { Load-Playlist; Play-Track 0; return }
            if ($script:LocalPlaying) { $script:Mp.Pause(); $script:LocalPlaying = $false; Set-NowPlaying ("Paused  -  " + [IO.Path]::GetFileNameWithoutExtension($script:Playlist[$script:TrackAt])) }
            else { $script:Mp.Play(); $script:LocalPlaying = $true; Set-NowPlaying ([string][char]0x266A + "  " + [IO.Path]::GetFileNameWithoutExtension($script:Playlist[$script:TrackAt])) }
        }
        "YouTube Music" { Ytm-Call "Post" "toggle-play" }
    }
}
function Music-Next { switch ((Get-MusicSettings).Source) { "My music" { Play-Track ($script:TrackAt + 1) } "YouTube Music" { Ytm-Call "Post" "next" } } }
function Music-Prev { switch ((Get-MusicSettings).Source) { "My music" { Play-Track ($script:TrackAt - 1) } "YouTube Music" { Ytm-Call "Post" "previous" } } }
function Music-Volume([int]$v) {
    $ms = Get-MusicSettings; $ms.Volume = $v
    if ($ms.Source -eq "My music" -and $script:Mp) { $script:Mp.Volume = $v / 100 }
    if ($ms.Source -eq "YouTube Music") { Ytm-Call "Post" "volume" @{ volume = $v } }
}
function Set-MusicSource([string]$src) {
    $ms = Get-MusicSettings
    if ($ms.Source -eq "My music" -and $src -ne "My music") { Stop-Local }
    $ms.Source = $src; Save-Look
    $musicTimer.Enabled = ($src -eq "YouTube Music")
    if ($src -ne "YouTube Music" -and $script:UI) { [LCMI.Ytm]::Stop() }
    switch ($src) {
        "Off" { Set-NowPlaying "" }
        "My music" { Load-Playlist; if ($script:Playlist.Count -gt 0) { Play-Track 0 } else { Set-NowPlaying "Choose a folder with your music" } }
        "YouTube Music" { if ($ms.Token) { Ytm-Begin } else { Set-NowPlaying "YouTube Music: press Connect" } }
    }
    Update-MusicPanel
}

# ---- the Music panel (opens from the header button, closes with Close) ----
if ($script:UI) {
    $musicPanel = New-Object LCMI.Card; $musicPanel.Fill = [System.Drawing.Color]::FromArgb(24, 26, 30); $musicPanel.Radius = 12
    $musicPanel.Border = [System.Drawing.Color]::FromArgb(60, 66, 76)
} else { $musicPanel = New-Object System.Windows.Forms.Panel; $musicPanel.BackColor = [System.Drawing.Color]::FromArgb(24, 26, 30); $musicPanel.BorderStyle = "FixedSingle" }
$musicPanel.Size = New-Object System.Drawing.Size(380, 300); $musicPanel.Visible = $false; $musicPanel.Anchor = "Top, Right"
$musicPanel.Controls.Add((New-Label "MUSIC" 18 12 200 34 $F_HEAD ([System.Drawing.Color]::White)))
$btnMusicClose = New-Button "Close" 290 14 72 28
$musicPanel.Controls.Add($btnMusicClose)
$musicPanel.Controls.Add((New-Label "Play" 18 58 60 22 $F_BODY $C_DIM))
$cmbMusic = New-Combo 80 54 282 @("Off", "My music", "YouTube Music")
$musicPanel.Controls.Add($cmbMusic)
$btnMusicFolder = New-Button "Choose Music Folder..." 18 92 200 30
$btnYtmConnect = New-Button "Connect" 18 92 120 30
$lblMusicHelp = New-Label "" 18 128 344 36 $F_SMALL $C_DIM
$btnPrev = New-Button ([string][char]0x23EE) 18 172 56 36
$btnPlay = New-Button ([string][char]0x23EF) 80 172 72 36 $true
$btnNext = New-Button ([string][char]0x23ED) 158 172 56 36
foreach ($b in @($btnPrev, $btnPlay, $btnNext)) { $b.Font = New-Object System.Drawing.Font("Segoe UI Symbol", 12) }
$musicPanel.Controls.Add((New-Label "Volume" 226 180 60 22 $F_BODY $C_DIM))
$trkVol = New-Object System.Windows.Forms.TrackBar
$trkVol.Minimum = 0; $trkVol.Maximum = 100; $trkVol.TickStyle = "None"; $trkVol.Location = New-Object System.Drawing.Point(282, 176); $trkVol.Size = New-Object System.Drawing.Size(84, 30)
$trkVol.BackColor = [System.Drawing.Color]::FromArgb(24, 26, 30)
$script:MusicNow = New-Label "Nothing playing" 18 222 344 44 $F_BODY $C_TEXT
$script:MusicNow.AutoEllipsis = $true
foreach ($c in @($btnMusicFolder, $btnYtmConnect, $lblMusicHelp, $btnPrev, $btnPlay, $btnNext, $trkVol, $script:MusicNow)) { $musicPanel.Controls.Add($c) }
$form.Controls.Add($musicPanel)

function Update-MusicPanel {
    $ms = Get-MusicSettings
    $script:MusicBusy = $true
    $cmbMusic.SelectedIndex = [math]::Max(0, @("Off", "My music", "YouTube Music").IndexOf([string]$ms.Source))
    $trkVol.Value = [math]::Min(100, [math]::Max(0, [int]$ms.Volume))
    $script:MusicBusy = $false
    $btnMusicFolder.Visible = ($ms.Source -eq "My music")
    $btnYtmConnect.Visible = ($ms.Source -eq "YouTube Music")
    $btnYtmConnect.Text = $(if ($ms.Token) { "Reconnect" } else { "Connect" })
    $on = ($ms.Source -ne "Off")
    foreach ($b in @($btnPrev, $btnPlay, $btnNext, $trkVol)) { $b.Enabled = $on }
    $lblMusicHelp.Text = switch ($ms.Source) {
        "My music" { $(if ($ms.Folder) { "Folder: " + $ms.Folder } else { "Pick a folder - mp3, wav, wma, m4a, aac and flac play in random order." }) }
        "YouTube Music" { "Open the YouTube Music app: Plugins > API Server [Beta] > Enabled. Then press Connect and click Allow." }
        default { "Music plays quietly while you use the installer." }
    }
}
function Show-MusicPanel {
    if ($musicPanel.Visible) { $musicPanel.Visible = $false; return }
    $musicPanel.Location = New-Object System.Drawing.Point(($form.ClientSize.Width - $musicPanel.Width - 20), 86)
    Update-MusicPanel
    $musicPanel.Visible = $true; $musicPanel.BringToFront()
}
$btnMusic.Add_Click({ Show-MusicPanel })
$btnMusicClose.Add_Click({ $musicPanel.Visible = $false })
$cmbMusic.Add_SelectedIndexChanged({ if ($script:MusicBusy -or $cmbMusic.SelectedIndex -lt 0) { return }; Set-MusicSource (@("Off", "My music", "YouTube Music")[$cmbMusic.SelectedIndex]) })
$btnMusicFolder.Add_Click({
    $d = New-Object System.Windows.Forms.FolderBrowserDialog
    $d.Description = "Pick the folder with your music"
    if ($d.ShowDialog() -ne "OK") { return }
    (Get-MusicSettings).Folder = $d.SelectedPath; Save-Look
    Load-Playlist
    if ($script:Playlist.Count -gt 0) { Play-Track 0; Set-Status "Playing $($script:Playlist.Count) song(s) from your folder." $C_GREEN } else { Set-NowPlaying "No music files in that folder" }
    Update-MusicPanel
})
$btnYtmConnect.Add_Click({ [void](Ytm-Connect); Update-MusicPanel })
$btnPlay.Add_Click({ Music-Toggle })
$btnNext.Add_Click({ Music-Next })
$btnPrev.Add_Click({ Music-Prev })
$trkVol.Add_ValueChanged({ if (-not $script:MusicBusy) { Music-Volume $trkVol.Value; $script:VolDirty = $true } })
$trkVol.Add_MouseUp({ if ($script:VolDirty) { Save-Look; $script:VolDirty = $false } })


# ============================================================================
#  Clean Up: files left behind by mods you removed (RTX Remix, graphics mods, old data)
# ============================================================================
function Test-FFFork($path) {
    try {
        $b = [IO.File]::ReadAllBytes($path)
        if ([Text.Encoding]::GetEncoding(28591).GetString($b).IndexOf("RTX Remix", [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
        return ([Text.Encoding]::Unicode.GetString($b).IndexOf("RTX Remix", [StringComparison]::OrdinalIgnoreCase) -ge 0)
    } catch { return $false }
}
function Get-RelFiles([string]$relDir) {
    $p = Join-Path $script:Game $relDir
    if (-not (Test-Path -LiteralPath $p)) { return @() }
    if (Test-Path -LiteralPath $p -PathType Leaf) { return @($relDir) }
    return @(Get-ChildItem -LiteralPath $p -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName.Substring($script:Game.Length).TrimStart("\") })
}
function Find-Leftovers {
    $items = @()
    if (-not $script:Game) { return $items }
    $g = $script:Game
    $mods = @(Load-Db)
    $on = @($mods | Where-Object { Test-ModOn $_ })
    $owned = @{}
    foreach ($m in $on) { foreach ($f in @($m.Files)) { if ($f) { $owned[([string]$f).ToLower()] = [string]$m.Name } } }
    $isOwned = { param($r) $owned.ContainsKey(([string]$r).ToLower()) }
    $rtxOn = @($on | Where-Object { @($_.Files | Where-Object { [string]$_ -match '(?i)(^|\\)rtx_comp\\' }).Count -gt 0 }).Count -gt 0

    # 1. RTX Remix leftovers
    if (-not $rtxOn) {
        $rtx = @()
        foreach ($d in @(".trex", "rtx-remix", "rtx_comp", "plugins\rtx-remix")) { $rtx += @(Get-RelFiles $d) }
        foreach ($f in @(Get-ChildItem -LiteralPath $g -File -Force -ErrorAction SilentlyContinue)) {
            if ($f.Name -match '(?i)^(rtx\.conf|dxvk\.conf|_LaunchWithProcessorAffinity.*\.bat|a_gta4-rtx\.asi|NvRemixBridge\.exe|GTAIV-Remix.*)$') { $rtx += $f.Name }
        }
        foreach ($f in @(Get-RelFiles "plugins")) { if ($f -match '(?i)^plugins\\(a_)?gta4-rtx\.asi$') { $rtx += $f } }
        if ($rtx.Count -gt 0 -and (Test-Path -LiteralPath (Join-Path $g "d3d9.dll")) -and -not (& $isOwned "d3d9.dll")) { $rtx += "d3d9.dll" }
        $rtx = @($rtx | Where-Object { -not (& $isOwned $_) } | Select-Object -Unique)
        if ($rtx.Count -gt 0) { $items += [pscustomobject]@{ Title = "RTX Remix leftovers"; Why = "RTX Remix isn't installed any more, but its files are still here. They can change how the game looks."; Files = $rtx; Tick = $true; Action = "recycle" } }
    }
    # 2. Fusion Fix is still the RTX version
    $ffAsi = Join-Path $g "plugins\GTAIV.EFLC.FusionFix.asi"
    if (-not $rtxOn -and (Test-Path -LiteralPath $ffAsi) -and (Test-FFFork $ffAsi)) {
        $items += [pscustomobject]@{ Title = "Fusion Fix is still the RTX version"; Why = "The RTX version changes lighting and shaders. This puts back the normal Fusion Fix (downloads the latest one)."; Files = @("plugins\GTAIV.EFLC.FusionFix.asi"); Tick = $true; Action = "reinstall-ff" }
    }
    # 3. shader files in update that no mod owns (only when Fusion Fix is managed here, so its own shaders are known)
    $ffMod = @($on | Where-Object { @($_.Files | Where-Object { [string]$_ -match '(?i)fusionfix\.asi$' }).Count -gt 0 }).Count -gt 0
    if ($ffMod) {
        $sh = @(Get-RelFiles "update" | Where-Object { $_ -match '(?i)[\\/]shaders[\\/]' })
        $sh = @($sh | Where-Object { -not (& $isOwned $_) -or ($owned[$_.ToLower()] -like "Loose*update*") })
        if ($sh.Count -gt 0) { $items += [pscustomobject]@{ Title = "Leftover shader files"; Why = "Old graphics files in the update folder that no mod uses. They change lighting and the sky."; Files = $sh; Tick = $true; Action = "recycle" } }
    }
    # 4. ENB / ReShade leftovers
    $enb = @()
    foreach ($n in @("enbseries.ini", "enblocal.ini", "enbpalette.bmp", "enbbloom.fx", "enbeffect.fx", "enbclouds.fx", "d3d9.fx")) { if (Test-Path -LiteralPath (Join-Path $g $n)) { $enb += $n } }
    $enb += @(Get-RelFiles "enbseries"); $enb += @(Get-RelFiles "reshade-shaders")
    foreach ($f in @(Get-ChildItem -LiteralPath $g -File -Filter "ReShade*.ini" -ErrorAction SilentlyContinue)) { $enb += $f.Name }
    $enb = @($enb | Where-Object { -not (& $isOwned $_) } | Select-Object -Unique)
    if ($enb.Count -gt 0) { $items += [pscustomobject]@{ Title = "Old ENB / ReShade files"; Why = "Graphics settings with no mod in your list. They change colors and effects."; Files = $enb; Tick = $false; Action = "recycle" } }
    # 5. a graphics wrapper nothing uses
    foreach ($w in @("d3d9.dll", "dxgi.dll", "d3d11.dll", "d3d8.dll")) {
        if ((Test-Path -LiteralPath (Join-Path $g $w)) -and -not (& $isOwned $w) -and -not (@($items | Where-Object { $_.Files -contains $w }).Count)) {
            $items += [pscustomobject]@{ Title = "$w with no mod using it"; Why = "Usually left behind by a graphics mod. Only clear it if you don't use ENB, ReShade, DXVK or RTX."; Files = @($w); Tick = $false; Action = "recycle" }
        }
    }
    # 6. the installer's own data for mods you removed
    $names = @($mods | ForEach-Object { ([string]$_.Name).ToLower() })
    $data = Get-DataDir
    $old = @()
    foreach ($sub in @("disabled", "backups", "archives", "library")) {
        $d = Join-Path $data $sub
        if (Test-Path $d) { foreach ($x in @(Get-ChildItem -LiteralPath $d -Directory -ErrorAction SilentlyContinue)) { if ($names -notcontains $x.Name.ToLower()) { $old += @(Get-ChildItem -LiteralPath $x.FullName -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName.Substring($g.Length).TrimStart("\") }) } } }
    }
    $t = Join-Path $data "temp"; if (Test-Path $t) { $old += @(Get-ChildItem -LiteralPath $t -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName.Substring($g.Length).TrimStart("\") }) }
    if ($old.Count -gt 0) { $items += [pscustomobject]@{ Title = "Old installer data"; Why = "Saved copies for mods that aren't in your list any more."; Files = $old; Tick = $true; Action = "recycle" } }
    # 7. logs and crash files
    $logs = @()
    foreach ($top in @("", "plugins", "scripts")) {
        $d = $(if ($top) { Join-Path $g $top } else { $g })
        if (Test-Path $d) { foreach ($f in @(Get-ChildItem -LiteralPath $d -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -match '(?i)^\.(log|dmp)$' -or $_.Name -match '(?i)^(metrics\.txt|.*session_log\.txt)$' })) { $logs += $f.FullName.Substring($g.Length).TrimStart("\") } }
    }
    $logs = @($logs | Where-Object { -not (& $isOwned $_) })
    if ($logs.Count -gt 0) { $items += [pscustomobject]@{ Title = "Log and crash files"; Why = "Written by the game and mods while playing - safe to remove."; Files = $logs; Tick = $true; Action = "recycle" } }
    return $items
}

# ---- Texture viewer: see the pictures inside a .wtd, save them, replace one ----
# (texture file layout from SparkIV by Aru and ahmed605, GPL v3)
function Show-Textures([byte[]]$bytes, [string]$title) {
    $script:TxResult = $null
    try { $script:TxW = [LCMI.Wtd]::Load($bytes) } catch {
        $e = $_.Exception; while ($e.InnerException) { $e = $e.InnerException }
        [System.Windows.Forms.MessageBox]::Show("Can't open this texture file:`n`n" + $e.Message, "Textures", "OK", "Warning") | Out-Null
        return $null
    }
    $script:TxOut = $null
    $d = New-Object System.Windows.Forms.Form
    $d.Text = "Textures - " + $title; $d.Size = New-Object System.Drawing.Size(1000, 640); $d.StartPosition = "CenterParent"
    $d.BackColor = $C_BG; $d.ForeColor = $C_TEXT; $d.Font = $F_BODY; $d.MinimumSize = New-Object System.Drawing.Size(760, 420)
    if ($form.Icon) { $d.Icon = $form.Icon }
    $top = New-Panel "Top" 84 $null
    $top.Controls.Add((New-Label ("TEXTURES  -  " + $title.ToUpper()) 20 10 900 36 (New-Font @("Bebas Neue", "Arial Narrow", "Segoe UI") 26 ([System.Drawing.FontStyle]::Bold)) ([System.Drawing.Color]::White)))
    $top.Controls.Add((New-Label "Pick a picture to see it. Replace Picture uses your image (png, jpg, bmp) - it's resized to the same size automatically." 21 50 940 22 $F_BODY $C_DIM))
    $lv = New-List @(@("Picture", 250), @("Size", 90), @("Type", 80))
    $lv.Dock = "Left"; $lv.Width = 440; $lv.MultiSelect = $false
    $gap = New-Panel "Left" 12 $null
    $pic = New-Object System.Windows.Forms.PictureBox
    $pic.Dock = "Fill"; $pic.SizeMode = "Zoom"; $pic.BackColor = [System.Drawing.Color]::FromArgb(24, 26, 30)
    $mid = New-Panel "Fill" 0 $null
    $mid.Padding = New-Object System.Windows.Forms.Padding(20, 0, 20, 0)
    $mid.Controls.Add($pic); $mid.Controls.Add($gap); $mid.Controls.Add($lv)
    $script:TxFill = {
        $sel = $(if ($lv.SelectedIndices.Count -gt 0) { $lv.SelectedIndices[0] } else { 0 })
        $lv.Items.Clear()
        for ($i = 0; $i -lt $script:TxW.Textures.Count; $i++) {
            $t = $script:TxW.Textures[$i]
            $it = New-Object System.Windows.Forms.ListViewItem([string]$t.Name)
            [void]$it.SubItems.Add("$($t.Width) x $($t.Height)"); [void]$it.SubItems.Add([LCMI.Wtd]::FormatName($t.Format)); $it.Tag = $i
            [void]$lv.Items.Add($it)
        }
        if ($lv.Items.Count -gt 0) { $lv.Items[[math]::Min($sel, $lv.Items.Count - 1)].Selected = $true }
    }
    $lv.Add_SelectedIndexChanged({
        if ($lv.SelectedItems.Count -eq 0) { return }
        try { $old = $pic.Image; $pic.Image = $script:TxW.Picture([int]$lv.SelectedItems[0].Tag); if ($old) { $old.Dispose() } } catch { $pic.Image = $null }
    })
    $bar = New-Panel "Bottom" 66 $null
    $bSave = New-Button "Save Picture..." 20 14 160 38
    $bRep = New-Button "Replace Picture..." 188 14 180 38
    $bDone = New-Button "Use Changes" 0 14 170 38 $true
    $bCancel = New-Button "Close" 0 14 110 38
    $bDone.Enabled = $false
    foreach ($c in @($bSave, $bRep, $bDone, $bCancel)) { $bar.Controls.Add($c) }
    $bar.Add_Resize({ $bDone.Left = $bar.Width - $bDone.Width - 20; $bCancel.Left = $bDone.Left - $bCancel.Width - 10 })
    $bCancel.Add_Click({ $d.Close() })
    $bSave.Add_Click({
        if ($lv.SelectedItems.Count -eq 0) { return }
        $i = [int]$lv.SelectedItems[0].Tag
        $sf = New-Object System.Windows.Forms.SaveFileDialog
        $sf.Filter = "PNG picture (*.png)|*.png"; $sf.FileName = ($script:TxW.Textures[$i].Name -replace '[\\/:*?"<>|]', '_') + ".png"
        if ([string]$sf.ShowDialog($d) -ne "OK") { return }
        $bmp = $script:TxW.Picture($i)
        try { $bmp.Save($sf.FileName, [System.Drawing.Imaging.ImageFormat]::Png) } finally { $bmp.Dispose() }
        Set-Status "Saved $(Split-Path $sf.FileName -Leaf)." $C_GREEN
    })
    $bRep.Add_Click({
        if ($lv.SelectedItems.Count -eq 0) { [System.Windows.Forms.MessageBox]::Show("Pick a picture in the list first.", "Replace Picture", "OK", "Information") | Out-Null; return }
        $i = [int]$lv.SelectedItems[0].Tag
        $t = $script:TxW.Textures[$i]
        $of = New-Object System.Windows.Forms.OpenFileDialog
        $of.Title = "Pick the new picture for " + $t.Name; $of.Filter = "Pictures (*.png;*.jpg;*.jpeg;*.bmp;*.gif)|*.png;*.jpg;*.jpeg;*.bmp;*.gif"
        if ([string]$of.ShowDialog($d) -ne "OK") { return }
        try {
            $ms = New-Object IO.MemoryStream(, [IO.File]::ReadAllBytes($of.FileName))
            $img = [System.Drawing.Image]::FromStream($ms)
            try { $script:TxW.Replace($i, $img) } finally { $img.Dispose(); $ms.Dispose() }
            $lv.SelectedItems[0].ForeColor = $C_GREEN
            $old = $pic.Image; $pic.Image = $script:TxW.Picture($i); if ($old) { $old.Dispose() }
            $bDone.Enabled = $true
            Set-Status "Replaced '$($t.Name)' ($($t.Width) x $($t.Height)). Press Use Changes when you're done." $C_GREEN
        } catch {
            $e = $_.Exception; while ($e.InnerException) { $e = $e.InnerException }
            [System.Windows.Forms.MessageBox]::Show("Couldn't use that picture:`n`n" + $e.Message, "Replace Picture", "OK", "Warning") | Out-Null
        }
    })
    $bDone.Add_Click({ $script:TxOut = $script:TxW.Save(); $d.Close() })
    $d.Controls.Add($mid); $d.Controls.Add($bar); $d.Controls.Add($top)
    $d.Add_Shown({ & $script:TxFill })
    if ($script:UI) { try { [LCMI.Dark]::Window($d) } catch { } }
    [void]$d.ShowDialog($form)
    if ($pic.Image) { $pic.Image.Dispose() }
    $d.Dispose()
    # the result is left in $script:TxResult (byte array, or nothing if closed without changes)
    $script:TxResult = $script:TxOut; $script:TxOut = $null; $script:TxW = $null
}
# a changed file becomes a "Replace ..." mod in Install
function New-ReplacePlan([string]$src, $t) {
    $leaf = $t.Inner.Split("/")[-1]
    if ((Split-Path $src -Leaf) -ine $leaf) {
        $tmpDir = Join-Path (Get-DataDir) ("temp\replace-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
        New-Item -ItemType Directory $tmpDir -Force | Out-Null
        Copy-Item -LiteralPath $src -Destination (Join-Path $tmpDir $leaf) -Force
        $src = Join-Path $tmpDir $leaf
    }
    $mod = Clean-Name ("Replace " + [IO.Path]::GetFileNameWithoutExtension($leaf))
    return [pscustomobject]@{ Mod = $mod; Rows = @(New-ArchiveRow $src $t $mod) }
}

# ---- Archive viewer: look inside the game's .img and .rpf files, take files out, replace or add ----
function Format-Size([long]$b) { if ($b -ge 1MB) { return ("{0:N1} MB" -f ($b / 1MB)) } if ($b -ge 1KB) { return ("{0:N0} KB" -f ($b / 1KB)) } return "$b B" }
function Show-Archives {
    if (-not $script:Game) { Set-Status "Pick your GTA IV folder first." $C_RED; return }
    if (-not $script:UI) { Set-Status "The archive tool couldn't start on this PC." $C_RED; return }
    Set-Status "Opening your game archives..." $C_DIM $false; [void]$form.Refresh()
    [void](Get-ArchiveIndex); $ix = $script:ArcIndex
    $script:AvKey = $null; try { $script:AvKey = Get-ArchiveKey } catch { }
    $d = New-Object System.Windows.Forms.Form
    $d.Text = "Game Archives"; $d.Size = New-Object System.Drawing.Size(1100, 680); $d.StartPosition = "CenterParent"
    $d.BackColor = $C_BG; $d.ForeColor = $C_TEXT; $d.Font = $F_BODY; $d.MinimumSize = New-Object System.Drawing.Size(820, 460)
    if ($form.Icon) { $d.Icon = $form.Icon }
    $top = New-Panel "Top" 118 $null
    $top.Controls.Add((New-Label "GAME ARCHIVES" 20 10 700 36 (New-Font @("Bebas Neue", "Arial Narrow", "Segoe UI") 26 ([System.Drawing.FontStyle]::Bold)) ([System.Drawing.Color]::White)))
    $top.Controls.Add((New-Label "Look inside .img and .rpf files. Replacing or adding a file makes a mod you can turn off - your originals are never changed." 21 50 1000 22 $F_BODY $C_DIM))
    $txtFind = New-Object System.Windows.Forms.TextBox
    $txtFind.Location = New-Object System.Drawing.Point(21, 80); $txtFind.Size = New-Object System.Drawing.Size(360, 26)
    $txtFind.BackColor = $C_PANEL2; $txtFind.ForeColor = $C_TEXT; $txtFind.BorderStyle = "FixedSingle"
    $bFind = New-Button "Find File" 390 77 120 32 $true
    $lblInfo = New-Label "" 524 82 520 24 $F_BODY $C_DIM
    foreach ($c in @($txtFind, $bFind, $lblInfo)) { $top.Controls.Add($c) }

    $lvA = New-List @(@("Archive", 250), @("Where", 150))
    $lvA.Dock = "Left"; $lvA.Width = 420; $lvA.MultiSelect = $false
    $split = New-Panel "Left" 10 $null
    $lvF = New-List @(@("File", 300), @("Inside", 260), @("Size", 90), @("Type", 110))
    $lvF.Dock = "Fill"; $lvF.MultiSelect = $true
    $mid = New-Panel "Fill" 0 $null
    $mid.Padding = New-Object System.Windows.Forms.Padding(20, 0, 20, 0)
    $mid.Controls.Add($lvF); $mid.Controls.Add($split); $mid.Controls.Add($lvA)

    foreach ($rel in @(Get-GameArchives | Sort-Object)) {
        $it = New-Object System.Windows.Forms.ListViewItem([string](Split-Path $rel -Leaf))
        [void]$it.SubItems.Add([string](Split-Path $rel -Parent)); $it.Tag = $rel
        [void]$lvA.Items.Add($it)
    }
    $typeOf = { param($n, $rsc) switch -regex ($n) { '(?i)\.wtd$' { "Textures" } '(?i)\.wft$' { "Vehicle/object" } '(?i)\.wdr$' { "Model" } '(?i)\.wdd$' { "Model set" } '(?i)\.wbn$|\.wbd$' { "Collision" } '(?i)\.(ide|ipl|wpl)$' { "Map data" } '(?i)\.(dat|xml|txt|csv)$' { "Data" } '(?i)\.sco$' { "Game script" } default { if ($rsc) { "Resource" } else { "File" } } } }
    $script:AvShow = {
        param($rel)
        $lvF.BeginUpdate(); $lvF.Items.Clear()
        try {
            $list = @(Read-ArchiveList $rel $script:AvKey)
            foreach ($x in $list) {
                $leaf = $x.Inner.Split("/")[-1]; $fold = $(if ($x.Inner.Contains("/")) { $x.Inner.Substring(0, $x.Inner.LastIndexOf("/")) } else { "" })
                $it = New-Object System.Windows.Forms.ListViewItem([string]$leaf)
                [void]$it.SubItems.Add([string]$fold); [void]$it.SubItems.Add((Format-Size $x.Size)); [void]$it.SubItems.Add((& $typeOf $leaf $x.Rsc))
                $it.Tag = [pscustomobject]@{ Archive = $rel; Inner = $x.Inner }
                [void]$lvF.Items.Add($it)
            }
            $lblInfo.Text = "$(Split-Path $rel -Leaf): $($list.Count) files"
        } catch {
            $e = $_.Exception; while ($e.InnerException) { $e = $e.InnerException }
            $lblInfo.Text = "Can't open this one: " + $e.Message
        } finally { $lvF.EndUpdate() }
        $lvF.Columns[1].Text = "Inside"
    }
    $lvA.Add_SelectedIndexChanged({ if ($lvA.SelectedItems.Count -gt 0) { & $script:AvShow ([string]$lvA.SelectedItems[0].Tag) } })
    $doFind = {
        $q = $txtFind.Text.Trim().ToLower()
        if (-not $q) { return }
        $lvF.BeginUpdate(); $lvF.Items.Clear(); $cnt = 0
        foreach ($k in @($ix.Keys | Where-Object { $_.Contains($q) } | Sort-Object | Select-Object -First 500)) {
            foreach ($h in @($ix[$k])) {
                $it = New-Object System.Windows.Forms.ListViewItem([string]$h.Inner.Split("/")[-1])
                [void]$it.SubItems.Add([string]$h.Archive); [void]$it.SubItems.Add(""); [void]$it.SubItems.Add((& $typeOf $k $false))
                $it.Tag = $h; [void]$lvF.Items.Add($it); $cnt++
            }
        }
        $lvF.EndUpdate(); $lvF.Columns[1].Text = "In archive"
        $lblInfo.Text = $(if ($cnt -eq 0) { "No file named like '$q' in your game archives." } else { "$cnt file(s) found" + $(if ($cnt -ge 500) { " (first 500)" } else { "" }) })
    }
    $bFind.Add_Click($doFind)
    $txtFind.Add_KeyDown({ if ($_.KeyCode -eq "Enter") { $_.SuppressKeyPress = $true; & $doFind } })

    $bar = New-Panel "Bottom" 66 $null
    $bOut = New-Button "Take Out..." 20 14 150 38
    $bRep = New-Button "Replace With..." 178 14 170 38
    $bAdd = New-Button "Add Files..." 356 14 150 38
    $bClose = New-Button "Close" 0 14 110 38 $true
    $bTex = New-Button "Textures..." 514 14 130 38
    $bOpenWtd = New-Button "Open .wtd File..." 652 14 170 38
    foreach ($c in @($bOut, $bRep, $bAdd, $bTex, $bOpenWtd, $bClose)) { $bar.Controls.Add($c) }
    # see / change the pictures inside a .wtd from the game
    $bTex.Add_Click({
        if ($lvF.SelectedItems.Count -ne 1 -or $lvF.SelectedItems[0].Tag.Inner -notmatch '(?i)\.wtd$') { [System.Windows.Forms.MessageBox]::Show("Pick one .wtd file in the list (texture files end with .wtd).", "Textures", "OK", "Information") | Out-Null; return }
        $t = $lvF.SelectedItems[0].Tag
        $leaf = $t.Inner.Split("/")[-1]
        try {
            $p = Join-Path $script:Game $t.Archive
            if ($t.Archive -match '(?i)\.img$') { $bytes = [LCMI.Img]::Extract($p, $script:AvKey, $t.Inner) } else { $bytes = [LCMI.Rpf]::Extract($p, $script:AvKey, $t.Inner) }
        } catch { $bytes = $null }
        if (-not $bytes) { [System.Windows.Forms.MessageBox]::Show("Couldn't read $leaf from the archive.", "Textures", "OK", "Warning") | Out-Null; return }
        [void](Show-Textures $bytes $leaf); $new = $script:TxResult
        if (-not $new) { return }
        $tmpDir = Join-Path (Get-DataDir) ("temp\tex-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
        New-Item -ItemType Directory $tmpDir -Force | Out-Null
        $tf = Join-Path $tmpDir $leaf
        [IO.File]::WriteAllBytes($tf, $new)
        $script:AvPlan = New-ReplacePlan $tf $t
        $d.Close()
    })
    # a .wtd file on your PC (for example from a mod before you install it)
    $bOpenWtd.Add_Click({
        $of = New-Object System.Windows.Forms.OpenFileDialog
        $of.Title = "Pick a texture file"; $of.Filter = "Texture files (*.wtd)|*.wtd"
        if ([string]$of.ShowDialog($d) -ne "OK") { return }
        [void](Show-Textures ([IO.File]::ReadAllBytes($of.FileName)) (Split-Path $of.FileName -Leaf)); $new = $script:TxResult
        if (-not $new) { return }
        $sf = New-Object System.Windows.Forms.SaveFileDialog
        $sf.Title = "Save the changed texture file"; $sf.Filter = "Texture files (*.wtd)|*.wtd"
        $sf.InitialDirectory = Split-Path $of.FileName -Parent; $sf.FileName = Split-Path $of.FileName -Leaf
        if ([string]$sf.ShowDialog($d) -ne "OK") { return }
        [IO.File]::WriteAllBytes($sf.FileName, $new)
        [System.Windows.Forms.MessageBox]::Show("Saved:`n$($sf.FileName)", "Textures", "OK", "Information") | Out-Null
    })
    $bar.Add_Resize({ $bClose.Left = $bar.Width - $bClose.Width - 20 })
    $bClose.Add_Click({ $d.Close() })

    # take files out to a folder you pick
    $bOut.Add_Click({
        $sel = @($lvF.SelectedItems | ForEach-Object { $_.Tag })
        if ($sel.Count -eq 0) { [System.Windows.Forms.MessageBox]::Show("Pick one or more files in the list first.", "Take Out", "OK", "Information") | Out-Null; return }
        $fb = New-Object System.Windows.Forms.FolderBrowserDialog
        $fb.Description = "Where should the files go?"
        if ([string]$fb.ShowDialog($d) -ne "OK") { return }
        $ok = 0; $bad = @()
        foreach ($t in $sel) {
            try {
                $p = Join-Path $script:Game $t.Archive
                if ($t.Archive -match '(?i)\.img$') { $bytes = [LCMI.Img]::Extract($p, $script:AvKey, $t.Inner) } else { $bytes = [LCMI.Rpf]::Extract($p, $script:AvKey, $t.Inner) }
                if ($null -eq $bytes) { $bad += $t.Inner; continue }
                [IO.File]::WriteAllBytes((Join-Path $fb.SelectedPath ($t.Inner.Split("/")[-1])), $bytes); $ok++
            } catch { $bad += $t.Inner }
        }
        $msg = "Took out $ok file(s) to:`n$($fb.SelectedPath)"
        if ($bad.Count -gt 0) { $msg += "`n`nCouldn't take out: " + (($bad | Select-Object -First 5) -join ", ") }
        [System.Windows.Forms.MessageBox]::Show($msg, "Take Out", "OK", "Information") | Out-Null
        if ($ok -gt 0) { Start-Process explorer.exe $fb.SelectedPath }
    })

    # replace one file: goes through Install, so it becomes a normal mod you can turn off
    $bRep.Add_Click({
        if ($lvF.SelectedItems.Count -ne 1) { [System.Windows.Forms.MessageBox]::Show("Pick one file in the list to replace.", "Replace", "OK", "Information") | Out-Null; return }
        $t = $lvF.SelectedItems[0].Tag
        $leaf = $t.Inner.Split("/")[-1]
        $of = New-Object System.Windows.Forms.OpenFileDialog
        $of.Title = "Pick the new $leaf"; $of.Filter = "Same type (*" + [IO.Path]::GetExtension($leaf) + ")|*" + [IO.Path]::GetExtension($leaf) + "|All files (*.*)|*.*"
        if ([string]$of.ShowDialog($d) -ne "OK") { return }
        $script:AvPlan = New-ReplacePlan $of.FileName $t
        $d.Close()
    })

    # add new files into the archive you have open
    $bAdd.Add_Click({
        if ($lvA.SelectedItems.Count -eq 0) { [System.Windows.Forms.MessageBox]::Show("Open an archive on the left first.", "Add Files", "OK", "Information") | Out-Null; return }
        $rel = [string]$lvA.SelectedItems[0].Tag
        $folder = ""
        if ($lvF.SelectedItems.Count -gt 0 -and $lvF.SelectedItems[0].Tag.Archive -eq $rel -and $lvF.SelectedItems[0].Tag.Inner.Contains("/")) { $in = $lvF.SelectedItems[0].Tag.Inner; $folder = $in.Substring(0, $in.LastIndexOf("/") + 1) }
        $of = New-Object System.Windows.Forms.OpenFileDialog
        $of.Title = "Pick files to add to " + (Split-Path $rel -Leaf); $of.Multiselect = $true; $of.Filter = "All files (*.*)|*.*"
        if ([string]$of.ShowDialog($d) -ne "OK") { return }
        $mod = Clean-Name ("Added to " + [IO.Path]::GetFileNameWithoutExtension($rel))
        $rows = @()
        foreach ($fn in @($of.FileNames)) {
            $rows += New-ArchiveRow $fn ([pscustomobject]@{ Archive = $rel; Inner = ($folder + (Split-Path $fn -Leaf).ToLower()) }) $mod
        }
        $script:AvPlan = [pscustomobject]@{ Mod = $mod; Rows = $rows }
        $d.Close()
    })

    $d.Controls.Add($mid); $d.Controls.Add($bar); $d.Controls.Add($top)
    $script:AvPlan = $null
    Set-Status "" $C_DIM $false
    if ($script:UI) { try { [LCMI.Dark]::Window($d) } catch { } }
    [void]$d.ShowDialog($form)
    $d.Dispose()
    if ($script:AvPlan) {
        # show it in Install: check it, change the name if you like, press Install
        Show-Page $PG_INSTALL
        Clear-Plan
        $script:PlanMod = $script:AvPlan.Mod
        $script:Plan = @($script:AvPlan.Rows)
        $txtMod.Text = $script:PlanMod
        Show-Plan
        Set-Status "Ready - press Install. It shows in My Mods, so you can turn it off any time." $C_GREEN
        $script:AvPlan = $null
    }
}
function Show-CleanUp {
    if (-not $script:Game) { return }
    Set-Status "Scanning your game folder for leftovers..." $C_DIM $false; $form.Refresh()
    $items = @(Find-Leftovers)
    if ($items.Count -eq 0) { Set-Status "All clean - no leftovers found." $C_GREEN; [System.Windows.Forms.MessageBox]::Show("All clean - no leftover files found.", "Clean Up", "OK", "Information") | Out-Null; return }
    $d = New-Object System.Windows.Forms.Form
    $d.Text = "Clean Up"; $d.Size = New-Object System.Drawing.Size(900, 620); $d.StartPosition = "CenterParent"
    $d.BackColor = $C_BG; $d.ForeColor = $C_TEXT; $d.Font = $F_BODY; $d.MinimumSize = New-Object System.Drawing.Size(700, 420)
    if ($form.Icon) { $d.Icon = $form.Icon }
    $top = New-Panel "Top" 84 $null
    $top.Controls.Add((New-Label "LEFTOVERS FOUND" 20 10 700 36 (New-Font @("Bebas Neue", "Arial Narrow", "Segoe UI") 26 ([System.Drawing.FontStyle]::Bold)) ([System.Drawing.Color]::White)))
    $top.Controls.Add((New-Label "Files left behind by mods you removed. Ticked items are cleaned - files go to the Recycle Bin." 21 50 820 22 $F_BODY $C_DIM))
    $host2 = New-Panel "Fill" 0 $null; $host2.AutoScroll = $true; $host2.Padding = New-Object System.Windows.Forms.Padding(20, 4, 20, 8)
    $script:CleanRows = @()
    for ($i = $items.Count - 1; $i -ge 0; $i--) {
        $it = $items[$i]
        if ($script:UI) { $row = New-Object LCMI.Card; $row.Fill = $C_PANEL2; $row.HoverFill = [System.Drawing.Color]::FromArgb(46, 50, 58); $row.Radius = 10 }
        else { $row = New-Object System.Windows.Forms.Panel; $row.BackColor = $C_PANEL2 }
        $row.Dock = "Top"; $row.Height = 84; $row.Cursor = [System.Windows.Forms.Cursors]::Hand; $row.Tag = $i
        $chk = New-Object System.Windows.Forms.Label
        $chk.Location = New-Object System.Drawing.Point(16, 30); $chk.Size = New-Object System.Drawing.Size(24, 24); $chk.TextAlign = "MiddleCenter"
        $chk.Font = New-Object System.Drawing.Font("Segoe UI Symbol", 11, [System.Drawing.FontStyle]::Bold)
        $title = New-Label ($it.Title + "   (" + @($it.Files).Count + " file" + $(if (@($it.Files).Count -ne 1) { "s" } else { "" }) + ")") 54 6 780 26 $F_BIG ([System.Drawing.Color]::White)
        $why = New-Label $it.Why 55 32 780 20 $F_BODY $C_DIM
        $sample = (@($it.Files | Select-Object -First 3) -join "    ") + $(if (@($it.Files).Count -gt 3) { "    +" + (@($it.Files).Count - 3) + " more" } else { "" })
        $sub = New-Label $sample 55 54 780 20 $F_SMALL $C_DIM
        foreach ($c in @($title, $why, $sub)) { $c.AutoEllipsis = $true }
        foreach ($c in @($chk, $title, $why, $sub)) { $row.Controls.Add($c); $c.Tag = $i; $c.Cursor = [System.Windows.Forms.Cursors]::Hand }
        $tog = { $r = $script:CleanRows[[int]$this.Tag]; Set-CleanRow $r (-not $r.On) }
        $row.Add_Click($tog); foreach ($c in @($chk, $title, $why, $sub)) { $c.Add_Click($tog) }
        $row.Add_Resize({ foreach ($c in $this.Controls) { if ($c.Left -ge 54) { $c.Width = [math]::Max(100, $this.Width - $c.Left - 16) } } })
        $gap = New-Panel "Top" 8 $null
        $host2.Controls.Add($gap); $host2.Controls.Add($row)
        $script:CleanRows = @([pscustomobject]@{ On = $false; Check = $chk; Title = $title; Item = $it }) + $script:CleanRows
    }
    foreach ($r in $script:CleanRows) { Set-CleanRow $r ([bool]$r.Item.Tick) }
    $bar = New-Panel "Bottom" 66 $null
    $bGo = New-Button "Clean Ticked" 0 14 200 38 $true
    $bClose = New-Button "Close" 0 14 110 38
    $bar.Controls.Add($bGo); $bar.Controls.Add($bClose)
    $bar.Add_Resize({ $bGo.Left = $bar.Width - $bGo.Width - 20; $bClose.Left = $bGo.Left - $bClose.Width - 10 })
    $bClose.Add_Click({ $d.DialogResult = "Cancel"; $d.Close() })
    $bGo.Add_Click({ $d.DialogResult = "OK"; $d.Close() })
    $d.Controls.Add($host2); $d.Controls.Add($bar); $d.Controls.Add($top)
    if ($script:UI) { try { [LCMI.Dark]::Window($d) } catch { } }
    $res = $d.ShowDialog($form)
    $picked = @($script:CleanRows | Where-Object { $_.On } | ForEach-Object { $_.Item })
    $d.Dispose()
    if ([string]$res -ne "OK" -or $picked.Count -eq 0) { Set-Status "Nothing was cleaned." $C_DIM; return }
    $n = 0; $ff = $false
    $mods = @(Load-Db); $dbChanged = $false
    foreach ($it in $picked) {
        if ($it.Action -eq "reinstall-ff") { $ff = $true; continue }
        foreach ($rel in @($it.Files)) {
            $p = Join-Path $script:Game ([string]$rel)
            if (Test-Path -LiteralPath $p) { Remove-ToRecycleBin $p; $n++; Remove-EmptyDirs (Split-Path $p -Parent) }
            # a cleaned file that was listed under loose update files is taken off that list (and out of its saved copy)
            foreach ($m in $mods) {
                if ([string]$m.Name -like "Loose*update*" -and (@($m.Files) -icontains [string]$rel)) {
                    $m.Files = @($m.Files | Where-Object { $_ -ine [string]$rel }); $dbChanged = $true
                    $lf = Get-LibFile $m.Name ([string]$rel); if (Test-Path -LiteralPath $lf) { Remove-Item -LiteralPath $lf -Force -ErrorAction SilentlyContinue }
                    $dep = Load-Deployed; $dep.Remove(([string]$rel).ToLower()); Save-Deployed $dep
                }
            }
        }
    }
    foreach ($sub in @("disabled", "backups", "archives", "library")) {   # empty folders of the installer's own data
        $dd = Join-Path (Get-DataDir) $sub
        if (Test-Path $dd) { foreach ($x in @(Get-ChildItem -LiteralPath $dd -Directory -ErrorAction SilentlyContinue)) { if (@(Get-ChildItem -LiteralPath $x.FullName -Recurse -File -ErrorAction SilentlyContinue).Count -eq 0) { Remove-Item -LiteralPath $x.FullName -Recurse -Force -ErrorAction SilentlyContinue } } }
    }
    if ($dbChanged) { Save-Db @($mods | Where-Object { @($_.Files).Count -gt 0 -or -not (($_.PSObject.Properties.Name -contains "Found") -and $_.Found) }) }
    Refresh-Garage
    Set-Status "Cleaned $n file(s) - they're in the Recycle Bin." $C_GREEN
    if ($ff) {
        $r = [System.Windows.Forms.MessageBox]::Show("Now put back the normal Fusion Fix?`n`nThe latest Fusion Fix downloads and opens in Install - then press Install (and Yes to reinstall).", "Clean Up", "YesNo", "Question")
        if ($r -eq "Yes") { Start-ModDownload $FF_URL "GTAIV.EFLC.FusionFix.zip" "Fusion Fix" }
    }
}
function Set-CleanRow($r, [bool]$on) {
    $r.On = $on
    $r.Check.Text = $(if ($on) { [string][char]0x2714 } else { "" })
    $r.Check.BackColor = $(if ($on) { $C_BLUE } else { [System.Drawing.Color]::FromArgb(58, 62, 70) })
    $r.Check.ForeColor = [System.Drawing.Color]::FromArgb(12, 16, 22)
    $r.Title.ForeColor = $(if ($on) { [System.Drawing.Color]::White } else { $C_DIM })
}

$form.Add_FormClosing({ Clear-Plan; if ($script:Watcher) { $script:Watcher.Dispose() }; try { Stop-Local; $musicTimer.Stop(); [LCMI.Ytm]::Stop() } catch { } })

Load-Look
# once: switch every page to the app's own background video (your colors and darkness stay)
if (-not $script:Look.ContainsKey("bgv") -and (Test-Path -LiteralPath $DEFAULT_BG)) {
    foreach ($k in @("get", "install", "mine", "settings")) { $e = Get-LookEntry $k; $e.Image = ""; $e.NoDefault = $false }
    $script:Look["bgv"] = [pscustomobject]@{ Color = ""; Image = ""; Dim = 0; Fit = "Fill"; V = 1 }
    Save-Look; Clean-LookFiles
}
foreach ($k in @("get", "install", "mine", "settings", "nav", "header", "status", "lists")) { try { Apply-LookTarget $k } catch { } }
$cmbLook.SelectedIndex = 0
$animOn = $true
if ($script:Look.ContainsKey("anim") -and $script:Look["anim"] -and ($script:Look["anim"].PSObject.Properties.Name -contains "On")) { $animOn = [bool]$script:Look["anim"].On }
$script:LookUiBusy = $true; $chkAnim.Checked = $animOn; $script:LookUiBusy = $false
if ($script:UI) { [LCMI.Anim]::Enabled = $animOn; try { [LCMI.Anim]::DoubleBuffer($form) } catch { }; try { [LCMI.Dark]::Window($form) } catch { } }
# pages drawn in one go (no flicker or smearing over picture/video backgrounds, also while scrolling).
# Not the Get Mods browser itself - it draws on its own.
if ($script:UI) {
    try {
        foreach ($c in @($pages[$PG_INSTALL], $pages[$PG_MINE], $pages[$PG_SETTINGS], $sites, $nav, $header, $status)) { [LCMI.Smooth]::Composite($c) }
    } catch { }
}
$found = Set-Game (Find-Game)
if (-not $script:Settings) { Load-Settings }
Clear-Plan
Show-Page $(if ($found) { $PG_GET } else { $PG_SETTINGS })
# ---- room for every text: labels grow to fit their words, Settings rows get space between them ----
$TF_WRAP = $null; try { $TF_WRAP = [System.Windows.Forms.TextFormatFlags]::WordBreak -bor [System.Windows.Forms.TextFormatFlags]::TextBoxControl -bor [System.Windows.Forms.TextFormatFlags]::NoPrefix } catch { }
# only for normal-size text that doesn't fit, and only when nothing sits right under it
function Fit-Label($l) {
    if (-not $l.Text -or $l.AutoSize -or $l.Width -lt 20 -or $l.Font.Size -gt 12) { return }
    try {
        $one = [System.Windows.Forms.TextRenderer]::MeasureText($l.Text, $l.Font)
        if ($one.Width -le $l.Width - 4 -and $one.Height -le $l.Height + 2 -and $l.Text -notmatch "`n") { return }
        $need = [System.Windows.Forms.TextRenderer]::MeasureText($l.Text, $l.Font, (New-Object System.Drawing.Size($l.Width, 0)), $TF_WRAP).Height + 4
        if ($need -le $l.Height) { return }
        $bottom = $l.Top + $need
        if ($l.Parent -and $l.Parent -ne $setBody) {
            foreach ($o in $l.Parent.Controls) {
                if ($o -eq $l -or -not $o.Visible) { continue }
                if ($o.Top -ge $l.Top + $l.Height - 2 -and $o.Top -lt $bottom -and $o.Left -lt $l.Right -and $o.Right -gt $l.Left) { return }   # would cover it
            }
        }
        $l.Height = $need
    } catch { }
}
function Fit-AllLabels($root) {
    foreach ($c in $root.Controls) {
        if ($c -is [System.Windows.Forms.ListView] -or $c -is [System.Windows.Forms.TextBox]) { continue }
        if ($c -is [System.Windows.Forms.Label]) { Fit-Label $c }
        elseif ($c.Controls.Count -gt 0) { Fit-AllLabels $c }
    }
}
# puts the Settings rows one under the other with a gap (a bit more before each section title)
function Space-Rows($panel, [int]$gap, [int]$sectionGap) {
    $items = @($panel.Controls | Where-Object { -not ($_ -is [System.Windows.Forms.ScrollBar]) } | Sort-Object Top, Left)
    $rows = New-Object System.Collections.ArrayList
    foreach ($c in $items) {
        if ($c -is [System.Windows.Forms.Panel] -and $c.Height -le 4 -and $rows.Count -gt 0) { [void]$rows[$rows.Count - 1].Items.Add($c); continue }   # a title's blue line stays with it
        $row = $null
        if ($rows.Count -gt 0) {
            $last = $rows[$rows.Count - 1]
            $mid = $c.Top + [math]::Min($c.Height, 30) / 2
            if ($mid -ge $last.Top -and $mid -lt $last.Top + [math]::Max(22, $last.Tall)) { $row = $last }
        }
        if (-not $row) { $row = [pscustomobject]@{ Top = $c.Top; Tall = $c.Height; Items = (New-Object System.Collections.ArrayList); Title = $false }; [void]$rows.Add($row) }
        [void]$row.Items.Add($c)
        if ($c.Top + $c.Height - $row.Top -gt $row.Tall -and -not ($c -is [System.Windows.Forms.Panel] -and $c.Height -le 4)) { $row.Tall = $c.Top + $c.Height - $row.Top }
        if ($c -is [System.Windows.Forms.Label] -and $c.Font -eq $F_BIG) { $row.Title = $true }
    }
    $y = $(if ($rows.Count -gt 0) { $rows[0].Top } else { 0 })
    $first = $true
    foreach ($r in $rows) {
        if (-not $first) { $y += $(if ($r.Title) { $sectionGap } else { $gap }) }
        $dy = $y - $r.Top
        foreach ($c in $r.Items) { $c.Top += $dy }
        $y += $r.Tall
        $first = $false
    }
}
try {
    Fit-AllLabels $form
    $setBody.SuspendLayout()
    Space-Rows $setBody 10 26
    $setBody.ResumeLayout()
} catch { }

try { Update-OldLaunchers } catch { }
$form.Add_Shown({
    try {
        $ms = Get-MusicSettings
        if ($ms.Source -eq "My music" -and $ms.AutoPlay) { Load-Playlist; if ($script:Playlist.Count -gt 0) { Play-Track 0 } }
        elseif ($ms.Source -eq "YouTube Music") { if ($ms.Token) { Ytm-Begin } else { Set-NowPlaying "YouTube Music: press Connect" } }
    } catch { }
    if ($script:Game -and $script:Settings.WatchDownloads) { $chkWatch.Checked = $true }
    Refresh-NexusUi
    if (-not $script:Game) { Set-Status "Couldn't find GTA IV. Click Change... and pick the folder with GTAIV.exe." $C_AMBER }
    elseif ($script:ImgRepaired) { Set-Status "Repaired $($script:ImgRepaired) model file(s) packed by an older version - the 'Invalid resource' crash should be gone." $C_GREEN }
    if ($ModPath -match '^nxm://') { Handle-Nxm $ModPath }
    elseif ($ModPath -and (Test-Path $ModPath)) { Load-Mod $ModPath }
})
if ($script:UI) {
    if (-not $OWN_EXE) { try { [LCMI.Taskbar]::SetWindow($form.Handle, $APP_ID, $env:LCMI_EXE, "Liberty City Mod Loader IV", $ICON_PATH) } catch { } }
    try { if ([LCMI.Anim]::Enabled) { [LCMI.Anim]::FadeIn($form, 320) } } catch { $form.Opacity = 1 }
}
$script:UiReady = $true
[void]$form.ShowDialog()
