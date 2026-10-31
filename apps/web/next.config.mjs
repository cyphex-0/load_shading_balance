const isDev = process.env.NODE_ENV !== 'production';
const DEFAULT_DEV_API = 'http://localhost:4000';
const DEFAULT_PROD_API = 'https://load-shading-balance.onrender.com';

const API_TARGET = (
  process.env.NEXT_PUBLIC_API_URL || (isDev ? DEFAULT_DEV_API : DEFAULT_PROD_API)
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
