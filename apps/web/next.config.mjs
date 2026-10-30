const API_TARGET = (
  process.env.NEXT_PUBLIC_API_URL || 'https://load-shading-balance.onrender.com'
).replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@load-shedding/shared'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_TARGET}/api/:path*`
      },
      {
        source: '/uploads/:path*',
        destination: `${API_TARGET}/uploads/:path*`
      }
    ];
  }
};

export default nextConfig;
