#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Base64エンコードファイルの読み込み
function encodeFileToBase64(filePath) {
    try {
        const file = fs.readFileSync(filePath);
        return file.toString('base64');
    } catch (error) {
        console.warn(`Warning: Could not read file ${filePath}`);
        return '';
    }
}

// メディアファイルの処理
function processMediaFiles() {
    const mediaDir = path.join(__dirname, 'slides-en/media');
    const mediaFiles = {};
    
    try {
        const files = fs.readdirSync(mediaDir);
        files.forEach(file => {
            const filePath = path.join(mediaDir, file);
            const ext = path.extname(file).toLowerCase();
            
            if (['.png', '.jpg', '.jpeg'].includes(ext)) {
                const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
                mediaFiles[file] = `data:${mimeType};base64,${encodeFileToBase64(filePath)}`;
            } else if (['.mp4'].includes(ext)) {
                mediaFiles[file] = `data:video/mp4;base64,${encodeFileToBase64(filePath)}`;
            }
        });
    } catch (error) {
        console.warn('Warning: Could not read media directory');
    }
    
    return mediaFiles;
}

// スライドファイルの読み込み
function loadSlides() {
    const slidesDir = path.join(__dirname, 'slides-en');
    const slides = {};
    
    for (let i = 0; i <= 10; i++) {
        const slideFile = path.join(slidesDir, `slide${i}.html`);
        try {
            slides[`slide${i}`] = fs.readFileSync(slideFile, 'utf8');
        } catch (error) {
            console.warn(`Warning: Could not read slide${i}.html`);
            slides[`slide${i}`] = '<div class="slide"><h2>Slide not found</h2></div>';
        }
    }
    
    return slides;
}

// CSSファイルの読み込み
function loadCSS() {
    const cssFile = path.join(__dirname, 'styles-en.css');
    try {
        return fs.readFileSync(cssFile, 'utf8');
    } catch (error) {
        console.warn('Warning: Could not read styles-en.css');
        return '';
    }
}

// メインHTMLファイルの読み込み
function loadMainHTML() {
    const htmlFile = path.join(__dirname, 'index-en.html');
    try {
        return fs.readFileSync(htmlFile, 'utf8');
    } catch (error) {
        console.error('Error: Could not read index-en.html');
        process.exit(1);
    }
}

// 単一ファイルの生成
function buildStandaloneHTML() {
    console.log('Building standalone HTML...');
    
    const mediaFiles = processMediaFiles();
    const slides = loadSlides();
    const css = loadCSS();
    let html = loadMainHTML();
    
    // CSSをインライン化
    html = html.replace('<link rel="stylesheet" href="styles-en.css">', `<style>${css}</style>`);
    
    // スライドデータとメディアファイルを埋め込み
    const embedScript = `
    <script>
        // Embedded slide data
        const embeddedSlides = ${JSON.stringify(slides)};
        
        // Embedded media files
        const embeddedMedia = ${JSON.stringify(mediaFiles)};
        
        // Override fetch for slides
        const originalFetch = window.fetch;
        window.fetch = function(url) {
            if (url.startsWith('slides-en/slide')) {
                const slideKey = url.replace('slides-en/', '').replace('.html', '');
                if (embeddedSlides[slideKey]) {
                    return Promise.resolve({
                        text: () => Promise.resolve(embeddedSlides[slideKey])
                    });
                }
            }
            return originalFetch.apply(this, arguments);
        };
        
        // Replace media file references
        function replaceMediaReferences() {
            document.querySelectorAll('img, video').forEach(element => {
                const src = element.getAttribute('src');
                if (src && src.includes('slides-en/media/')) {
                    const filename = src.split('/').pop();
                    if (embeddedMedia[filename]) {
                        element.src = embeddedMedia[filename];
                    }
                }
            });
            
            // Handle source elements within video tags
            document.querySelectorAll('source').forEach(element => {
                const src = element.getAttribute('src');
                if (src && src.includes('slides-en/media/')) {
                    const filename = src.split('/').pop();
                    if (embeddedMedia[filename]) {
                        element.src = embeddedMedia[filename];
                    }
                }
            });
        }
        
        // Monitor for DOM changes and replace media references
        const observer = new MutationObserver(replaceMediaReferences);
        observer.observe(document.body, { childList: true, subtree: true });
        
        // Initial replacement
        document.addEventListener('DOMContentLoaded', replaceMediaReferences);
    </script>`;
    
    // スクリプトをheadに挿入
    html = html.replace('</head>', `${embedScript}</head>`);
    
    // 出力ファイルの保存
    const outputFile = path.join(__dirname, 'standalone-presentation-en.html');
    fs.writeFileSync(outputFile, html);
    
    console.log(`✅ Standalone presentation built: ${outputFile}`);
    console.log(`📊 File size: ${(fs.statSync(outputFile).size / 1024 / 1024).toFixed(2)} MB`);
}

// 実行
buildStandaloneHTML();