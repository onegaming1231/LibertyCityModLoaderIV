# Liberty City Mod Loader IV

A mod manager made for **GTA IV: The Complete Edition**.
Install mods in one click, turn them off and on anytime, and never break your game again.

**[Download the latest version](https://github.com/onegaming1231/LibertyCityModLoaderIV/releases)** · Version 1.0 · made by Feen Aka AnnaEnxo

---

## What it does

Modding GTA IV usually means copying files by hand, replacing game files, editing `gta.dat` and hoping nothing breaks.
Liberty City Mod Loader IV does all of that for you. It reads the mod, shows you where every file will go,
and puts it in the right place. **Your original game files are never changed.**

## Features

**Get Mods**
- Built-in browser with the best GTA IV mod sites (LibertyCity, Nexus, GTAinside, ModDB, GTAForums, LCPDFR)
- Works with Nexus "Mod Manager Download" buttons, and can watch your Downloads folder

**Install**
- Drop a `.zip` `.rar` `.7z` `.oiv` or a folder - see every file and where it goes before anything is copied
- Loose models and textures are packed for you automatically
- Clothes and faces for Niko go into a modded copy of playerped.rpf (the original stays untouched)
- gta.dat, images.txt and default.dat lines are added for you, never overwritten
- Car lines (handling, vehicles.ide, carcols, cargrp) are added for you
- New add-on characters and cars are added to the Liberty's Legacy trainer list
- A "Before you install" check warns about missing tools and steps the readme wants done by hand
- **New:** press **3D** on a model file to see it before you install

**My Mods**
- Turn any mod on or off - nothing is deleted
- Move mods up and down - the lower one wins when two mods change the same file
- **New: Texture mixing** - two mods that change different textures in the same file both work
- Check for Conflicts, Nexus update checks, share your mod list, find mods you installed by hand

**Game Archives**
- Look inside `.img` and `.rpf` files, take files out, replace them or add new ones (as a mod you can turn off)
- See, save and replace the textures in `.wtd` files
- **New: 3D View** - see cars (`.wft`), characters (`.wdd`) and objects (`.wdr`) in 3D with their textures

**Something wrong in the game?**
- **Play Without Mods** - test the plain game, then bring all mods back with one click
- **Find the Broken Mod** - finds the mod that breaks your game, step by step
- **Clean Up** - removes files left behind by old mods

**Settings**
- Quick links to essential tools (ScriptHookDotNet, DLSS-IV and more)
- Your own background (video, GIF or picture) and a music player (your music or YouTube Music)

## Requirements

- GTA IV: The Complete Edition (1.2.0.59)
- [Fusion Fix](https://github.com/ThirteenAG/GTAIV.EFLC.FusionFix)
- Windows 10 or 11 (64-bit)
- Optional: 7-Zip or WinRAR for `.7z` and `.rar` mods
- Optional: a free Nexus Mods API key for update checks

## How to install

1. Download the zip from [Releases](https://github.com/onegaming1231/LibertyCityModLoaderIV/releases)
2. Unzip it anywhere (not inside the game folder)
3. Open **Liberty City Mod Loader IV.exe**
4. The app finds GTA IV by itself. Go to Install, drop in a mod, press Install

## Can't do

- Graphics mods (ENB, ReShade, RTX Remix) - install those by hand
- Mods with their own setup program (`.exe`) - run them yourself

## Safe?

Scanned on VirusTotal: **0 / 64**. The `.exe` and `.dll` files are the official Electron files;
only the name, icon, version info and Electron security settings (fuses) are changed. All app code is in this repository.

## Build it yourself

The app is [Electron](https://www.electronjs.org/) + a React window + an engine in plain JavaScript (`electron/engine`, no extra packages).

1. Install [Node.js](https://nodejs.org/) (LTS)
2. `npm install`
3. `node scripts/build.cjs` (needs the Tailwind CLI: `npx @tailwindcss/cli`, or set `TAILWIND=<path>`)
4. Run it: `npx electron .`
5. Make the app folder from the official Electron zip (`electron-v44.5.1-win32-x64.zip` from [Electron releases](https://github.com/electron/electron/releases)):
   `node scripts/package.cjs electron-v44.5.1-win32-x64.zip out\LibertyCityModLoaderIV win`

Tests: `test/fixture.cjs` makes a fake GTA IV folder, `test/e2e.cjs` clicks through the app.

## Credits

- **SparkIV** - by Aru, GitHub version by ahmed605 - texture and model code used under the GPL v3 license
- **Fusion Fix** - by ThirteenAG and contributors
- **ScriptHookDotNet** - by HazardX, Complete Edition version by Priler
- **DLSS-IV** - by ChunkLeChuck
- **Liberty's Legacy Trainer** - by konstantinos96b
- **Electron** - the app frame
- **Background video** - "Lola Del Rio" live wallpaper from MoeWalls, art by Rockstar Games
- **Fonts** - Bebas Neue (Dharma Type) and Barlow (Jeremy Tribby), SIL Open Font License

## License

GPL v3 - see [LICENSE-GPL3.txt](LICENSE-GPL3.txt).
