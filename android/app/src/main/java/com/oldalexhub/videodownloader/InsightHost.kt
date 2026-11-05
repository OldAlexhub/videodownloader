package com.oldalexhub.videodownloader

import java.util.Locale

/** Host-only analytics input. Never accept a full URL or truncate an oversized host. */
internal object InsightHost {
  fun normalize(value: String?): String? {
    val host = value?.trim()?.lowercase(Locale.ROOT) ?: return null
    if (host.isEmpty() || host.length > 253) return null
    // Explicit characters avoid Java's nested-character-class regex semantics.
    return host.takeIf { candidate ->
      candidate.all { it in 'a'..'z' || it in '0'..'9' || it in ".:-[]" }
    }
  }
}
