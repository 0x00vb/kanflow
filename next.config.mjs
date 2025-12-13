/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable X-Powered-By header
  poweredByHeader: false,

  // Custom headers for security
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ]
  },

  // Experimental features for better performance
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma'],
  },

  // Environment variables that should be available to the browser
  env: {
    NEXT_PUBLIC_WS_PORT: process.env.WS_PORT || '8080',
  },

  // TypeScript strict mode
  typescript: {
    tsconfigPath: './tsconfig.json',
  },

  // ESLint configuration
  eslint: {
    ignoreDuringBuilds: false,
  },
}

export default nextConfig
