        // アプリケーションハンドルがあれば、現在のセッションIDを取得
        if let Some(app_handle) = &self.app_handle {
            if let Ok(session_id_guard) = app_handle.state::<AppState>().current_session_id.lock() {
                if let Some(session_id) = *session_id_guard {
                    self.session_id = Some(session_id);
                    info!("現在のセッションID: {}", session_id);
                } else {
                    info!("セッションIDが設定されていません");
                }
            } else {
                error!("セッションIDのロックを取得できませんでした");
            }
        } 

        // AppStateからデータベースプールを取得
        let db_pool = {
            let db_pool_guard = match app_handle_clone.state::<AppState>().db_pool.lock() {
                Ok(guard) => guard,
                Err(e) => {
                    error!("データベースプールのロック取得に失敗: {}", e);
                    return;
                }
            };

            match &*db_pool_guard {
                Some(pool) => pool.clone(),
                None => {
                    error!("データベース接続がありません");
                    return;
                }
            }
        }; 