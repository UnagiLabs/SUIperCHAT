/** @type {import('next').NextConfig} */
const nextConfig = {
    // 静的エクスポートの設定
    output: 'export',
    // 画像の最適化を無効化（静的エクスポートに必要）
    images: {
        unoptimized: true
    }
}

module.exports = nextConfig