package com.oldalexhub.videodownloader

import java.util.Locale
import org.junit.Assert.*
import org.junit.Test

class InsightHostTest {
  @Test fun browserDomainsReachTheVisitEventWithoutThrowing() {
    assertEquals("example.com", InsightHost.normalize("example.com"))
    assertEquals("www.example-site.com", InsightHost.normalize("  WWW.Example-Site.COM  "))
    assertEquals("xn--bcher-kva.example", InsightHost.normalize("xn--bcher-kva.example"))
    assertEquals("192.0.2.1", InsightHost.normalize("192.0.2.1"))
    assertEquals("[2001:db8::1]", InsightHost.normalize("[2001:DB8::1]"))
  }

  @Test fun urlsCredentialsPathsAndOversizedInputsAreNotCollected() {
    listOf(null, "", " ", "https://example.com", "example.com/watch", "example.com?token=secret",
      "user@example.com", "example.com#fragment", "example .com", "a".repeat(254))
      .forEach { assertNull("Unexpected host accepted: $it", InsightHost.normalize(it)) }
  }

  @Test fun deviceLocaleDoesNotCorruptAsciiHostnames() {
    val original = Locale.getDefault()
    try {
      Locale.setDefault(Locale("tr", "TR"))
      assertEquals("video.example", InsightHost.normalize("VIDEO.EXAMPLE"))
    } finally { Locale.setDefault(original) }
  }
}
