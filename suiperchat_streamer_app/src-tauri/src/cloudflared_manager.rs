use std::path::{Path, PathBuf};
use std::fs;
use std::io::{self, Write};
use tauri::AppHandle;
use thiserror::Error;
use tracing::{info, warn, error};

#[derive(Error, Debug)]
pub enum CloudflaredManagerError {
    #[error("Failed to create directory: {0}")]
    DirectoryCreationFailed(#[from] io::Error),
    
    #[error("Failed to download cloudflared: {0}")]
    DownloadFailed(String),
    
    #[error("Unsupported platform")]
    UnsupportedPlatform,
    
    #[error("Failed to set executable permissions")]
    PermissionsFailed,
    
    #[error("Cloudflared binary not found at expected path")]
    BinaryNotFound,
}

pub struct CloudflaredManager {
    app_handle: AppHandle,
    binary_path: PathBuf,
}

impl CloudflaredManager {
    pub fn new(app_handle: AppHandle) -> Result<Self, CloudflaredManagerError> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| CloudflaredManagerError::DownloadFailed(e.to_string()))?;
        
        let binary_name = if cfg!(target_os = "windows") {
            "cloudflared.exe"
        } else {
            "cloudflared"
        };
        
        let binary_path = app_data_dir.join("bin").join(binary_name);
        
        Ok(Self {
            app_handle,
            binary_path,
        })
    }
    
    pub async fn ensure_cloudflared(&self) -> Result<PathBuf, CloudflaredManagerError> {
        if self.binary_path.exists() {
            info!("Cloudflared binary found at: {:?}", self.binary_path);
            return Ok(self.binary_path.clone());
        }
        
        info!("Cloudflared binary not found, downloading...");
        self.download_cloudflared().await?;
        
        if !self.binary_path.exists() {
            return Err(CloudflaredManagerError::BinaryNotFound);
        }
        
        Ok(self.binary_path.clone())
    }
    
    async fn download_cloudflared(&self) -> Result<(), CloudflaredManagerError> {
        let download_url = self.get_download_url()?;
        
        // バイナリディレクトリを作成
        if let Some(parent) = self.binary_path.parent() {
            fs::create_dir_all(parent)?;
        }
        
        info!("Downloading cloudflared from: {}", download_url);
        
        // HTTP クライアントを使用してダウンロード
        let response = reqwest::get(&download_url)
            .await
            .map_err(|e| CloudflaredManagerError::DownloadFailed(e.to_string()))?;
        
        if !response.status().is_success() {
            return Err(CloudflaredManagerError::DownloadFailed(
                format!("HTTP {}", response.status())
            ));
        }
        
        let bytes = response
            .bytes()
            .await
            .map_err(|e| CloudflaredManagerError::DownloadFailed(e.to_string()))?;
        
        // ファイルに書き込み
        let mut file = fs::File::create(&self.binary_path)?;
        file.write_all(&bytes)?;
        
        // Unix系OSでは実行権限を設定
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&self.binary_path)?.permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&self.binary_path, perms)
                .map_err(|_| CloudflaredManagerError::PermissionsFailed)?;
        }
        
        info!("Cloudflared downloaded successfully to: {:?}", self.binary_path);
        Ok(())
    }
    
    fn get_download_url(&self) -> Result<String, CloudflaredManagerError> {
        let base_url = "https://github.com/cloudflare/cloudflared/releases/latest/download";
        
        let filename = if cfg!(target_os = "windows") {
            if cfg!(target_arch = "x86_64") {
                "cloudflared-windows-amd64.exe"
            } else if cfg!(target_arch = "aarch64") {
                "cloudflared-windows-arm64.exe"
            } else {
                return Err(CloudflaredManagerError::UnsupportedPlatform);
            }
        } else if cfg!(target_os = "macos") {
            if cfg!(target_arch = "x86_64") {
                "cloudflared-darwin-amd64.tgz"
            } else if cfg!(target_arch = "aarch64") {
                "cloudflared-darwin-amd64.tgz" // ARM64版がない場合はAMD64を使用
            } else {
                return Err(CloudflaredManagerError::UnsupportedPlatform);
            }
        } else if cfg!(target_os = "linux") {
            if cfg!(target_arch = "x86_64") {
                "cloudflared-linux-amd64"
            } else if cfg!(target_arch = "aarch64") {
                "cloudflared-linux-arm64"
            } else {
                return Err(CloudflaredManagerError::UnsupportedPlatform);
            }
        } else {
            return Err(CloudflaredManagerError::UnsupportedPlatform);
        };
        
        Ok(format!("{}/{}", base_url, filename))
    }
    
    pub fn get_binary_path(&self) -> &Path {
        &self.binary_path
    }
}