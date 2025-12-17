import { MentionData } from '@/types'

// Regular expression to find @mentions in text
export const MENTION_REGEX = /@(\w+)/g

// Parse mentions from text and return mention data
export function parseMentions(text: string): { text: string; mentions: string[] } {
  const mentions: string[] = []
  let processedText = text

  // Find all @mentions
  const matches = text.matchAll(MENTION_REGEX)

  for (const match of matches) {
    const mentionText = match[1] // The username part after @
    if (mentionText && !mentions.includes(mentionText)) {
      mentions.push(mentionText)
    }
  }

  return {
    text: processedText,
    mentions,
  }
}

// Highlight mentions in text for display
export function highlightMentions(text: string, mentionMap: Record<string, MentionData>): string {
  return text.replace(MENTION_REGEX, (match, username) => {
    const mentionData = mentionMap[username.toLowerCase()]
    if (mentionData) {
      return `<span class="mention-highlight" data-user-id="${mentionData.userId}">@${mentionData.userName}</span>`
    }
    return match // Keep original if user not found
  })
}

// Extract user IDs from mention syntax in text
export function extractMentionedUserIds(text: string, userMap: Record<string, string>): string[] {
  const mentionedUserIds: string[] = []
  const matches = text.matchAll(MENTION_REGEX)

  for (const match of matches) {
    const username = match[1].toLowerCase()
    const userId = userMap[username]
    if (userId && !mentionedUserIds.includes(userId)) {
      mentionedUserIds.push(userId)
    }
  }

  return mentionedUserIds
}

// Create a user map for mention resolution (username -> userId)
export function createUserMap(users: Array<{ id: string; name: string }>): Record<string, string> {
  const userMap: Record<string, string> = {}

  users.forEach(user => {
    // Map both the full name and individual words for flexibility
    const nameParts = user.name.toLowerCase().split(' ')
    nameParts.forEach(part => {
      if (part.length > 0) {
        userMap[part] = user.id
      }
    })

    // Also map the full name with spaces replaced
    const fullNameKey = user.name.toLowerCase().replace(/\s+/g, '')
    userMap[fullNameKey] = user.id
  })

  return userMap
}

// Validate if a mention is valid for a given user list
export function validateMentions(text: string, validUsernames: Set<string>): { isValid: boolean; invalidMentions: string[] } {
  const invalidMentions: string[] = []
  const matches = text.matchAll(MENTION_REGEX)

  for (const match of matches) {
    const username = match[1].toLowerCase()
    if (!validUsernames.has(username)) {
      invalidMentions.push(`@${match[1]}`)
    }
  }

  return {
    isValid: invalidMentions.length === 0,
    invalidMentions,
  }
}


