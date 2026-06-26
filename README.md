# Film Assistant Desktop

React provides the colour workspace. Tauri connects it to a local LibRaw
`dcraw_emu` process for real RAW decoding. Photos remain on the computer.

## Requirements

- Node.js 20 or newer
- Rust stable with Cargo
- LibRaw `dcraw_emu` for the target operating system

On Windows, place `dcraw_emu.exe` in `src-tauri/bin/`. During development you
can instead set `LIBRAW_DCRAW_EMU` to its absolute path.

## Run

```powershell
npm.cmd install
npm.cmd run desktop:dev
```

Browser-only preview remains available with `npm.cmd run dev`. In browser mode,
RAW files use an embedded JPEG fallback. In desktop mode, use the dedicated
"Open RAW or photo from computer" button to invoke LibRaw.
