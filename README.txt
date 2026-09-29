LIBERTY CITY MOD LOADER IV 1.0
for GTA IV: The Complete Edition (Steam / Rockstar) with Fusion Fix
===================================================================

WHAT IT DOES
  Download, install and manage GTA IV mods from any website.
  Your original game files are never changed: mods load from the
  "update" folder through Fusion Fix.

START
  1. Extract this zip anywhere (for example your Desktop).
     Keep the "app" folder next to the program.
  2. Double-click "Liberty City Mod Loader IV.exe".
     Tip: right-click it > Show more options > Send to > Desktop
     (create shortcut) to get an icon on your Desktop.
  3. The installer finds GTA IV on its own. If it doesn't, open
     Settings > Change... and pick the folder that has GTAIV.exe.
  4. First time: open Settings > Essentials. If Fusion Fix isn't
     installed, click "Get Fusion Fix" and download the version you want.

GET MODS
  - Click a site (LibertyCity, Nexus Mods, GTAinside, ModDB,
    GTAForums, LCPDFR) or paste any link in the address bar.
  - Click the site's Download button. The mod opens in Install.
  - Nexus: log in once inside the app and use "Manual Download".
  - Downloaded with Chrome/Edge/Firefox instead? The installer
    notices it in your Downloads folder and offers to open it.
    Or drag the file onto the window.

INSTALL
  - Check the list: every file shows where it will go.
      Ready        - installs automatically
      Into archive - goes inside a game archive like playerped.rpf
                     (Niko's clothes and face). Done automatically.
      Packed model - a model/texture packed into an .img Fusion Fix loads.
  - The app knows every file inside your game's .img and .rpf archives
    (it reads them once, the first time - this takes a moment). So a
    mod file without a folder path still goes to the right archive, and
    the Note says which file it replaces. "New model (not in your game)"
    means it's an add-on - it may also need lines added (see its readme).
      Needs you    - can't be placed safely (the reason is shown)
      Preview      - the mod's preview pictures. The game doesn't use
                     them. Double-click one, or press View Pictures,
                     to look through them (arrow keys flip, Esc closes).
      Skipped      - readmes and notes
  - Files the game doesn't know about (a script mod's .ini, .xml...)
    are placed using clues, strongest first:
      a folder you picked before for the same kind of file
      the same file already in your game (it's replaced + backed up)
      the mod's readme ("copy to scripts\...")
      your installed scripts/plugins (they name their own folders)
      files named the same way you already have (Suit_*.ini)
      .ini settings that look like one you already have
    The Note column says which clue was used.
  - Still amber? Double-click the row and pick the folder yourself.
    The app remembers it for next time.
  - Change the mod name if you like, then press Install.

MY MODS
  - Every mod shows as ONE name, with all its files inside it
    (scripts, .ini files, update folder files, plugins...).
  - Tick / untick a mod to turn it on or off. Nothing is deleted.
    Each mod keeps its own copy of its files (in LCModInstaller\library,
    no extra disk space on the same drive), so you can turn mods off and
    on in any order, any time later, and the right files always come back.
  - Two mods with the same file: the mod LOWER in the list wins. When you
    turn a mod back on and it shares files with another mod that is on,
    you choose: Yes = this mod wins, No = the other mod keeps its files.
  - Settings you change in a mod's .ini are kept when you turn it off.
  - A mod file deleted by mistake is put back the next time the app starts.
  - Uninstall removes a mod and restores anything it replaced.
  - Check for Conflicts finds mods that replace the same files.
  - Find Other Mods looks for mods you installed by hand or with
    another tool (update folder, scripts, plugins, .asi files,
    ENB/ReShade). Files you copied in together (within 2 minutes), or
    with the same name in different folders, are shown as one mod.
    ScriptHook stays on its own, because many mods need it.
    Tick them and press Add to My Mods - then you can turn them on/off
    like any other mod. A bar at the top tells you when it finds some.
    Fusion Fix itself is never listed.
  - Refresh checks your game folder again and shows what changed.
  - Clean Up finds files left behind by mods you removed (RTX Remix,
    old ENB/ReShade, shader files nobody uses, the RTX version of
    Fusion Fix, logs, old installer data). Ticked items go to the
    Recycle Bin, so you can get them back.
  - Archives (top of My Mods) - like SparkIV/OpenIV, built in:
      Click an archive on the left to see what's inside.
      Find File searches every archive by name (e.g. "admiral").
      Take Out     - copies the picked files to a folder.
      Replace With - pick your file; it becomes a mod in Install
                     (press Install). Turn it off any time in My Mods.
      Add Files    - adds new files to the archive you have open, the
                     same way.
      Textures     - pick a .wtd file (texture file) and press Textures.
                     You see every picture inside it (like Niko's face
                     or a car's paint). Save Picture saves one as .png.
                     Replace Picture puts in your own picture (png, jpg,
                     bmp) - it's resized to the right size for you.
                     Press Use Changes: it becomes a mod in Install.
      Open .wtd File - the same for a .wtd file on your PC (for example
                     from a mod before you install it).
    Your original archives are never changed.
  - "Missing" means some of a mod's files were deleted outside the
    app. Uninstall it and install it again to fix.
  - Close the game before turning mods on/off or installing.

SETTINGS
  - Essentials (each button opens the page in Get Mods - pick the
    version you want, download it, and it opens in Install):
      Get Fusion Fix        - Fusion Fix's GitHub releases
        Optional: Fix Old Radio     - Radio Restoration (brings back the
                                      removed songs; run its program)
                  Fix Traffic Glitch - stops the same cars repeating
      Get ScriptHookDotNet  - the CE fork on Nexus Mods
      Get DLSS-IV           - DLSS / FSR on Nexus Mods
  - Pop up for mods in your Downloads folder (on/off).
  - Right-click "Install with Liberty City Mod Loader IV".
  - Nexus Mods key (optional).
  - Clear downloaded files.
  - Look: the app plays its own background video on every page.
      1. "Change": pick All pages, one page, Side menu, Top bar,
         Bottom bar or Lists.
      2. Pick Color... for a color. Remove Background shows just the
         color. Reset brings the app's video back.
      3. Picture darkness keeps text readable. Fit: Fill, Fit, Tile
         or Center.
      Live Wallpapers... / Game Wallpapers... open free live wallpaper
      sites (Pexels videos, MoeWalls) in Get Mods. Download a video and
      the app asks to use it as the background of all pages.
      "Smooth animations" can be switched off on a slow PC.
      Saved on this PC in %APPDATA%\LibertyCityModInstaller.

WHERE MODS GO
  Models, textures, game files  -> update\<Mod name>\
  Loose models (.wft .wtd ...)  -> update\<Mod name>\models.img
  Files for game archives       -> update\LC Installer Archives\
                                   (a modded copy, e.g. of playerped.rpf)
  Scripts (.cs, .net.dll)       -> scripts\
  Plugins (.asi), graphics      -> game folder
  Installer data               -> LCModInstaller\ in the game folder
    library\<Mod name>           each mod's own copy of its files
    replaced\                    game files a mod replaced (put back when
                                 the mod is off or uninstalled)

GOOD TO KNOW
  - Mods that bring their own gta.dat, images.txt or default.dat
    (add-on characters and cars): the app never uses their whole file.
    It takes your game's own file and adds only the new lines each mod
    needs, into update\LC Installer Data. So several add-on mods work
    together. A line pointing to a file that doesn't exist is left out
    (it would crash the game) - see LCModInstaller\merges.log.
  - Graphics mods (ENB, ReShade, RTX Remix, lighting and visual
    overhauls) are not supported - install those by hand.
  - .zip and .oiv always open. For .rar and .7z install 7-Zip
    (free, 7-zip.org).
  - The built-in browser uses Microsoft Edge WebView2 (already on
    Windows 10/11). The first time, a small Microsoft component
    (about 2 MB) is downloaded.
  - Script mods need ScriptHookDotNet. Most mods need Fusion Fix.
  - Game archives (like playerped.rpf): the installer never edits
    your original. It builds one modded copy that holds every mod
    that's on, and rebuilds it when you turn mods on/off or uninstall.
    The first time, it asks if you want an extra backup of the
    original too. The archive key is read from your own GTAIV.exe.
  - Mods that ADD new characters or cars (not replace) usually need
    extra lines in game files - follow the mod's readme.
  - Windows may warn the first time because the program was
    downloaded and isn't signed. Choose "More info" > "Run anyway".
  - Windows Security may call the .exe "Wacatac.B!ml". The "!ml" means
    it only guessed (a common false alarm for new, unsigned programs).
    Allow it, or use app\Start Liberty City Mod Loader IV.bat instead.
  - If your antivirus blocks the .exe, open the "app" folder and
    double-click "Start Liberty City Mod Loader IV.bat" instead.
    It is the same program.
  - If something goes wrong, details are saved to
    %TEMP%\LibertyCityModInstaller.log

MUSIC
  Press the Music button at the top right.
  - My music: pick a folder (mp3, wav, wma, m4a, aac, flac).
    Songs play in random order, and start again when you open the app.
  - YouTube Music: in the YouTube Music app turn on
    Plugins > API Server [Beta] > Enabled, then press Connect here
    and click Allow in YouTube Music. Play/pause, next, previous
    and volume control the app, and the song name shows at the top.
  - Close hides the panel. Choose Off to stop the music.

CREDITS AND LICENCE
  Reading .img archives and texture files follows SparkIV's RageLib
  (by Aru and ahmed605, GPL v3). This app is shared under the same
  licence: GNU GPL v3 (see app\LICENSE-GPL3.txt). Its full source code
  is included in the app folder.

FONTS
  Bebas Neue and Barlow (app\fonts) are free fonts under the SIL
  Open Font License (licence files included). They are used only by
  this app and are not installed on your PC.

UNINSTALL THE INSTALLER
  Settings > Remove It (right-click menu), and switch off Nexus
  download handling if you turned it on. Then delete this folder
  and %APPDATA%\LibertyCityModInstaller.
  Your installed mods stay; remove them first in My Mods if you
  want the game back to how it was.
