use crate::errors::AppError;
use crate::models::{AuthSession, CrashRecoveryNotice, UserRole};
use sqlx::SqlitePool;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct AppState {
    pub pool: Arc<std::sync::RwLock<SqlitePool>>,
    pub db_path: Arc<std::sync::RwLock<Option<PathBuf>>>,
    pub restore_mutex: Arc<tokio::sync::Mutex<()>>,
    pub session: Arc<RwLock<Option<AuthSession>>>,
    pub lan_server_running: Arc<RwLock<bool>>,
    pub lan_mdns_active: Arc<RwLock<bool>>,
    pub lan_server_port: Arc<RwLock<u16>>,
    pub lan_server_stop_tx: Arc<RwLock<Option<tokio::sync::oneshot::Sender<()>>>>,
    pub lan_ca_pem: Arc<RwLock<String>>,
    pub pending_crash_recovery: Arc<RwLock<Option<CrashRecoveryNotice>>>,
}

impl AppState {
    pub fn new(pool: SqlitePool) -> Self {
        Self {
            pool: Arc::new(std::sync::RwLock::new(pool)),
            db_path: Arc::new(std::sync::RwLock::new(None)),
            restore_mutex: Arc::new(tokio::sync::Mutex::new(())),
            session: Arc::new(RwLock::new(None)),
            lan_server_running: Arc::new(RwLock::new(false)),
            lan_mdns_active: Arc::new(RwLock::new(false)),
            lan_server_port: Arc::new(RwLock::new(3443)),
            lan_server_stop_tx: Arc::new(RwLock::new(None)),
            lan_ca_pem: Arc::new(RwLock::new(String::new())),
            pending_crash_recovery: Arc::new(RwLock::new(None)),
        }
    }

    pub fn new_with_port(pool: SqlitePool, port: u16) -> Self {
        Self {
            pool: Arc::new(std::sync::RwLock::new(pool)),
            db_path: Arc::new(std::sync::RwLock::new(None)),
            restore_mutex: Arc::new(tokio::sync::Mutex::new(())),
            session: Arc::new(RwLock::new(None)),
            lan_server_running: Arc::new(RwLock::new(false)),
            lan_mdns_active: Arc::new(RwLock::new(false)),
            lan_server_port: Arc::new(RwLock::new(port)),
            lan_server_stop_tx: Arc::new(RwLock::new(None)),
            lan_ca_pem: Arc::new(RwLock::new(String::new())),
            pending_crash_recovery: Arc::new(RwLock::new(None)),
        }
    }

    pub fn new_with_db_path(pool: SqlitePool, db_path: PathBuf) -> Self {
        Self {
            pool: Arc::new(std::sync::RwLock::new(pool)),
            db_path: Arc::new(std::sync::RwLock::new(Some(db_path))),
            restore_mutex: Arc::new(tokio::sync::Mutex::new(())),
            session: Arc::new(RwLock::new(None)),
            lan_server_running: Arc::new(RwLock::new(false)),
            lan_mdns_active: Arc::new(RwLock::new(false)),
            lan_server_port: Arc::new(RwLock::new(3443)),
            lan_server_stop_tx: Arc::new(RwLock::new(None)),
            lan_ca_pem: Arc::new(RwLock::new(String::new())),
            pending_crash_recovery: Arc::new(RwLock::new(None)),
        }
    }

    /// Obtiene un clone del pool SQLite activo de manera segura ante reemplazos
    pub fn pool(&self) -> SqlitePool {
        self.pool
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    /// Reemplaza el pool SQLite activo atómicamente y retorna el pool anterior
    pub fn replace_pool(&self, new_pool: SqlitePool) -> SqlitePool {
        let mut guard = self.pool.write().unwrap_or_else(|e| e.into_inner());
        std::mem::replace(&mut *guard, new_pool)
    }

    /// Obtiene la ruta del archivo SQLite activo si fue configurada
    pub fn db_path(&self) -> Option<PathBuf> {
        self.db_path
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    /// Obtiene una copia de la sesión actual si existe
    pub async fn get_session(&self) -> Option<AuthSession> {
        let lock = self.session.read().await;
        lock.clone()
    }

    /// Actualiza o limpia la sesión actual
    pub async fn set_session(&self, new_session: Option<AuthSession>) {
        let mut lock = self.session.write().await;
        *lock = new_session;
    }

    /// Obtiene el aviso de recuperación por cierre forzado pendiente si existe
    pub async fn get_crash_recovery_notice(&self) -> Option<CrashRecoveryNotice> {
        let lock = self.pending_crash_recovery.read().await;
        lock.clone()
    }

    /// Registra un aviso de recuperación por cierre forzado
    pub async fn set_crash_recovery_notice(&self, notice: Option<CrashRecoveryNotice>) {
        let mut lock = self.pending_crash_recovery.write().await;
        *lock = notice;
    }

    /// Limpia el aviso de recuperación una vez que el usuario lo atendió
    pub async fn clear_crash_recovery_notice(&self) {
        let mut lock = self.pending_crash_recovery.write().await;
        *lock = None;
    }

    /// Exige que exista una sesión activa y que NO esté bloqueada
    pub async fn require_unlocked_session(&self) -> Result<AuthSession, AppError> {
        let lock = self.session.read().await;
        match &*lock {
            Some(sess) => {
                if sess.is_locked {
                    Err(AppError::SessionLocked(
                        "La sesión se encuentra bloqueada. Ingrese su contraseña para desbloquear.".into(),
                    ))
                } else {
                    Ok(sess.clone())
                }
            }
            None => Err(AppError::Unauthorized("No hay una sesión activa en el sistema.".into())),
        }
    }

    /// Exige que exista una sesión activa (permite que esté bloqueada, por ejemplo para unlock)
    pub async fn require_session_allow_locked(&self) -> Result<AuthSession, AppError> {
        let lock = self.session.read().await;
        match &*lock {
            Some(sess) => Ok(sess.clone()),
            None => Err(AppError::Unauthorized("No hay una sesión activa en el sistema.".into())),
        }
    }

    /// Exige que exista una sesión activa, no bloqueada, y con rol ADMINISTRADOR
    pub async fn require_admin(&self) -> Result<AuthSession, AppError> {
        let session = self.require_unlocked_session().await?;
        if session.rol != UserRole::Administrador {
            return Err(AppError::Forbidden(
                "Esta acción requiere privilegios de ADMINISTRADOR.".into(),
            ));
        }
        Ok(session)
    }
}
