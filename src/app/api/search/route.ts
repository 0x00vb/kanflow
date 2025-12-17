import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { redisClient, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'
import { searchFilterSchema } from '@/lib/validation/schemas'
import { getUserFromRequest } from '@/lib/auth'
import { withAuth } from '@/middleware/auth'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'
import { SearchResult } from '@/types'

// GET /api/search - Global search across boards, tasks, and users
export const GET = withAuth(async (request: NextRequest) => {
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)

  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const queryParams = {
      q: searchParams.get('q') || '',
      type: searchParams.get('type') as 'boards' | 'tasks' | 'users' | undefined,
      boardId: searchParams.get('boardId') || undefined,
      assigneeId: searchParams.get('assigneeId') || undefined,
      priority: searchParams.get('priority') as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | undefined,
      dueDateFrom: searchParams.get('dueDateFrom') || undefined,
      dueDateTo: searchParams.get('dueDateTo') || undefined,
      labels: searchParams.get('labels')?.split(',') || undefined,
      limit: Math.min(parseInt(searchParams.get('limit') || '20'), 50),
      offset: parseInt(searchParams.get('offset') || '0'),
    }

    // Validate query parameters
    const validationResult = searchFilterSchema.safeParse(queryParams)
    if (!validationResult.success) {
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/search', status_code: '400' })

      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        { status: 400 }
      )
    }

    const {
      q,
      type,
      boardId,
      assigneeId,
      priority,
      dueDateFrom,
      dueDateTo,
      labels,
      limit,
      offset,
    } = validationResult.data

    // Create cache key
    const cacheKey = CACHE_KEYS.SEARCH_RESULTS(userId, q || '', type, boardId, assigneeId, priority, dueDateFrom, dueDateTo, labels?.join(','), limit, offset)

    // Try to get from cache first
    const cachedResults = await redisClient.get(cacheKey)
    if (cachedResults) {
      const responseTime = Date.now() - startTime
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/search', status_code: '200' })
      metrics.cacheHits.inc({ cache_type: 'redis' })

      logger.info({ userId, q, type, responseTime, cached: true }, 'Retrieved search results from cache')
      return NextResponse.json({
        success: true,
        data: JSON.parse(cachedResults),
        cached: true,
      })
    }

    const results: SearchResult[] = []
    const searchTerm = q?.trim() || ''

    // If no search term and no filters, return empty results
    if (!searchTerm && !type && !assigneeId && !priority && !dueDateFrom && !dueDateTo && !labels?.length) {
      const emptyResult = {
        results: [],
        pagination: {
          page: 1,
          limit,
          total: 0,
          totalPages: 0,
        },
      }

      await redisClient.setEx(cacheKey, CACHE_TTL.SEARCH_RESULTS, JSON.stringify(emptyResult))

      return NextResponse.json({
        success: true,
        data: emptyResult,
        cached: false,
      })
    }

    // Search boards
    if (!type || type === 'boards') {
      const boardWhere: any = {
        members: {
          some: {
            userId,
          },
        },
      }

      // Add search term filter for boards
      if (searchTerm) {
        boardWhere.OR = [
          { title: { contains: searchTerm, mode: 'insensitive' } },
          { description: { contains: searchTerm, mode: 'insensitive' } },
        ]
      }

      const boards = await prisma.board.findMany({
        where: boardWhere,
        select: {
          id: true,
          title: true,
          description: true,
          createdAt: true,
          _count: {
            select: {
              columns: true,
              members: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: type ? limit : Math.ceil(limit / 3), // Divide limit if searching all types
        skip: type ? offset : 0,
      })

      boards.forEach(board => {
        let matchScore = 0
        let highlightedText = board.title

        if (searchTerm) {
          // Calculate match score
          if (board.title.toLowerCase().includes(searchTerm.toLowerCase())) {
            matchScore += 10
            highlightedText = board.title.replace(
              new RegExp(`(${searchTerm})`, 'gi'),
              '<mark>$1</mark>'
            )
          }
          if (board.description?.toLowerCase().includes(searchTerm.toLowerCase())) {
            matchScore += 5
          }
        }

        results.push({
          type: 'board',
          id: board.id,
          title: board.title,
          description: board.description || undefined,
          matchScore,
          highlightedText,
        })
      })
    }

    // Search tasks
    if (!type || type === 'tasks') {
      const taskWhere: any = {
        column: {
          board: {
            members: {
              some: {
                userId,
              },
            },
          },
        },
      }

      // Add board filter if specified
      if (boardId) {
        taskWhere.column.board.id = boardId
      }

      // Add search term filter for tasks
      if (searchTerm) {
        taskWhere.OR = [
          { title: { contains: searchTerm, mode: 'insensitive' } },
          { description: { contains: searchTerm, mode: 'insensitive' } },
        ]
      }

      // Add filters
      if (assigneeId) {
        taskWhere.assigneeId = assigneeId
      }

      if (priority) {
        taskWhere.priority = priority
      }

      if (dueDateFrom || dueDateTo) {
        taskWhere.dueDate = {}
        if (dueDateFrom) {
          taskWhere.dueDate.gte = new Date(dueDateFrom)
        }
        if (dueDateTo) {
          taskWhere.dueDate.lte = new Date(dueDateTo)
        }
      }

      if (labels && labels.length > 0) {
        taskWhere.labels = {
          hasSome: labels,
        }
      }

      const tasks = await prisma.task.findMany({
        where: taskWhere,
        select: {
          id: true,
          title: true,
          description: true,
          priority: true,
          labels: true,
          dueDate: true,
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          column: {
            select: {
              id: true,
              board: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: type ? limit : Math.ceil(limit / 3),
        skip: type ? offset : 0,
      })

      tasks.forEach(task => {
        let matchScore = 0
        let highlightedText = task.title

        if (searchTerm) {
          // Calculate match score
          if (task.title.toLowerCase().includes(searchTerm.toLowerCase())) {
            matchScore += 10
            highlightedText = task.title.replace(
              new RegExp(`(${searchTerm})`, 'gi'),
              '<mark>$1</mark>'
            )
          }
          if (task.description?.toLowerCase().includes(searchTerm.toLowerCase())) {
            matchScore += 3
          }
        }

        // Add filter match scores
        if (assigneeId && task.assignee?.id === assigneeId) matchScore += 5
        if (priority && task.priority === priority) matchScore += 5
        if (labels && labels.some(label => task.labels?.includes(label))) matchScore += 5

        results.push({
          type: 'task',
          id: task.id,
          title: task.title,
          description: task.description || undefined,
          boardId: task.column.board.id,
          assignee: task.assignee || undefined,
          priority: task.priority,
          dueDate: task.dueDate || undefined,
          labels: task.labels || undefined,
          matchScore,
          highlightedText,
        })
      })
    }

    // Search users (only if searching all types or specifically users)
    if (!type || type === 'users') {
      const userWhere: any = {}

      // Add search term filter for users
      if (searchTerm) {
        userWhere.OR = [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { email: { contains: searchTerm, mode: 'insensitive' } },
        ]
      }

      const users = await prisma.user.findMany({
        where: userWhere,
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
        },
        orderBy: {
          name: 'asc',
        },
        take: type ? limit : Math.ceil(limit / 3),
        skip: type ? offset : 0,
      })

      users.forEach(user => {
        let matchScore = 0
        let highlightedText = user.name

        if (searchTerm) {
          // Calculate match score
          if (user.name.toLowerCase().includes(searchTerm.toLowerCase())) {
            matchScore += 10
            highlightedText = user.name.replace(
              new RegExp(`(${searchTerm})`, 'gi'),
              '<mark>$1</mark>'
            )
          }
          if (user.email.toLowerCase().includes(searchTerm.toLowerCase())) {
            matchScore += 5
          }
        }

        results.push({
          type: 'user',
          id: user.id,
          title: user.name,
          description: user.email,
          matchScore,
          highlightedText,
        })
      })
    }

    // Sort results by match score and apply pagination
    const sortedResults = results
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(offset, offset + limit)

    const totalResults = results.length

    const result = {
      results: sortedResults,
      pagination: {
        page: Math.floor(offset / limit) + 1,
        limit,
        total: totalResults,
        totalPages: Math.ceil(totalResults / limit),
      },
    }

    // Cache the result
    await redisClient.setEx(cacheKey, CACHE_TTL.SEARCH_RESULTS, JSON.stringify(result))

    const responseTime = Date.now() - startTime
    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/search', status_code: '200' })
    metrics.cacheMisses.inc({ cache_type: 'redis' })

    logger.info({
      userId,
      q: searchTerm,
      type,
      resultCount: sortedResults.length,
      totalResults,
      responseTime,
    }, 'Performed global search')

    return NextResponse.json({
      success: true,
      data: result,
      cached: false,
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, responseTime }, 'Failed to perform search')

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/search', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to perform search',
      },
      { status: 500 }
    )
  }
})
