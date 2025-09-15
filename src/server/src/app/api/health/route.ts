import { NextResponse } from 'next/server';
import { env } from '~/env';

/**
 * Health check endpoint for Kubernetes liveness and readiness probes
 */
export async function GET() {
  try {
    // Basic health checks
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      deployment: env.DEPLOYMENT_PLATFORM,
      namespace: env.KUBE_NAMESPACE,
      version: process.env.npm_package_version ?? 'unknown',
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
      storage: {
        provider: 'DO_SPACES',
        bucket: env.DO_SPACES_BUCKET ? 'configured' : 'not_configured',
        region: env.DO_SPACES_REGION,
      },
    };

    return NextResponse.json(health, { status: 200 });
  } catch (error) {
    const errorResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}

