import type { PeerIdStr, UserProfile } from '@federation/models'

const MENTION_RE = /@([\w.-]+)/g

export class MentionResolver {
  /** Parse message content for @name patterns and return matching PeerIds. */
  extractMentions(content: string, members: Map<PeerIdStr, UserProfile>): PeerIdStr[] {
    const found = new Set<PeerIdStr>()
    const nameMap = new Map<string, PeerIdStr>()

    for (const [peerId, profile] of members) {
      nameMap.set(profile.displayName.toLowerCase(), peerId)
    }

    let match: RegExpExecArray | null
    MENTION_RE.lastIndex = 0
    while ((match = MENTION_RE.exec(content)) !== null) {
      const hit = nameMap.get(match[1].toLowerCase())
      if (hit) found.add(hit)
    }

    return Array.from(found)
  }

  /** Return member profiles whose displayName starts with the typed partial string. */
  getAutocompleteSuggestions(
    input: string,
    members: Map<PeerIdStr, UserProfile>,
    limit = 8,
  ): UserProfile[] {
    const lower = input.toLowerCase()
    const results: UserProfile[] = []
    for (const profile of members.values()) {
      if (profile.displayName.toLowerCase().startsWith(lower)) {
        results.push(profile)
        if (results.length >= limit) break
      }
    }
    return results
  }
}
