import pino from 'pino'

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label }
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
})

export { logger }

// Helper functions for different log levels
// Pino expects (obj, message) format
export const log = {
  info: (message: string, obj?: unknown) => logger.info(obj || {}, message),
  warn: (message: string, obj?: unknown) => logger.warn(obj || {}, message),
  error: (message: string, obj?: unknown) => logger.error(obj || {}, message),
  debug: (message: string, obj?: unknown) => logger.debug(obj || {}, message),
  fatal: (message: string, obj?: unknown) => logger.fatal(obj || {}, message),
}
