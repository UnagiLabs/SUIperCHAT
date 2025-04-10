// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // --- libクレートのrunメソッドを呼び出す ---
    app_lib::run();
}
