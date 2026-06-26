use image::{codecs::jpeg::JpegEncoder, DynamicImage, GenericImageView};
use serde::Serialize;
use std::{
    collections::hash_map::DefaultHasher,
    env,
    fs::{self, File},
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RawPreview {
    preview_path: String,
    width: u32,
    height: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopHealth {
    message: String,
    raw_decoder_found: bool,
    decoder_path: Option<String>,
}

fn decoder_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "dcraw_emu.exe"
    } else {
        "dcraw_emu"
    }
}

fn find_decoder(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(path) = env::var("LIBRAW_DCRAW_EMU") {
        let candidate = PathBuf::from(path);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    if let Ok(resources) = app.path().resource_dir() {
        let candidate = resources.join("bin").join(decoder_name());
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    let local = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("bin")
        .join(decoder_name());
    if local.is_file() {
        return Ok(local);
    }

    if Command::new(decoder_name()).arg("-v").output().is_ok() {
        return Ok(PathBuf::from(decoder_name()));
    }

    Err(format!(
        "LibRaw decoder was not found. Put {} in src-tauri/bin or set LIBRAW_DCRAW_EMU.",
        decoder_name()
    ))
}

fn cache_directory() -> Result<PathBuf, String> {
    let directory = env::temp_dir().join("film-assistant").join("previews");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create preview cache: {error}"))?;
    Ok(directory)
}

fn cache_key(path: &Path) -> String {
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    if let Ok(metadata) = path.metadata() {
        metadata.len().hash(&mut hasher);
        metadata.modified().ok().hash(&mut hasher);
    }
    format!("{:016x}", hasher.finish())
}

fn run_raw_decode(decoder: &Path, source: &Path, output: &Path, half_size: bool) -> Result<(), String> {
    let mut command = Command::new(decoder);
    command.args(["-w", "-q", "3", "-T"]);
    if half_size {
        command.arg("-h");
    }
    command.arg("-O").arg(output).arg(source);

    let result = command
        .output()
        .map_err(|error| format!("Could not start LibRaw: {error}"))?;

    if !result.status.success() {
        let details = String::from_utf8_lossy(&result.stderr);
        return Err(format!("LibRaw could not decode this photo: {}", details.trim()));
    }
    if !output.is_file() {
        return Err("LibRaw finished without creating an image.".into());
    }
    Ok(())
}

fn save_preview(image: DynamicImage, destination: &Path) -> Result<(u32, u32), String> {
    let (source_width, source_height) = image.dimensions();
    let preview = image.thumbnail(2400, 2400).to_rgb8();
    let file = File::create(destination)
        .map_err(|error| format!("Could not create preview: {error}"))?;
    JpegEncoder::new_with_quality(file, 92)
        .encode_image(&preview)
        .map_err(|error| format!("Could not encode preview: {error}"))?;
    Ok((source_width, source_height))
}

#[tauri::command]
fn decode_raw_preview(app: AppHandle, source_path: String) -> Result<RawPreview, String> {
    let source = PathBuf::from(&source_path);
    if !source.is_file() {
        return Err("The selected RAW file does not exist.".into());
    }

    let decoder = find_decoder(&app)?;
    let cache = cache_directory()?;
    let key = cache_key(&source);
    let tiff_path = cache.join(format!("{key}.tiff"));
    let preview_path = cache.join(format!("{key}.jpg"));

    if !preview_path.is_file() {
        run_raw_decode(&decoder, &source, &tiff_path, true)?;
        let decoded = image::open(&tiff_path)
            .map_err(|error| format!("Could not open LibRaw output: {error}"))?;
        save_preview(decoded, &preview_path)?;
        let _ = fs::remove_file(&tiff_path);
    }

    let preview = image::open(&preview_path)
        .map_err(|error| format!("Could not verify preview: {error}"))?;
    let (width, height) = preview.dimensions();

    Ok(RawPreview {
        preview_path: preview_path.to_string_lossy().into_owned(),
        width,
        height,
    })
}

#[tauri::command]
fn desktop_health_check(app: AppHandle) -> DesktopHealth {
    match find_decoder(&app) {
        Ok(path) => DesktopHealth {
            message: "RAW engine ready. React successfully called Rust.".into(),
            raw_decoder_found: true,
            decoder_path: Some(path.to_string_lossy().into_owned()),
        },
        Err(error) => DesktopHealth {
            message: format!("React reached Rust, but the RAW decoder is not ready yet: {error}"),
            raw_decoder_found: false,
            decoder_path: None,
        },
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            decode_raw_preview,
            desktop_health_check,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Film Assistant");
}
