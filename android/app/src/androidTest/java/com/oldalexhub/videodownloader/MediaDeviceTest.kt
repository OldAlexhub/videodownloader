package com.oldalexhub.videodownloader

import androidx.test.platform.app.InstrumentationRegistry
import com.oldalexhub.videodownloader.download.MediaVerifier
import org.junit.Test
import org.junit.Assert.*
import java.io.File

class MediaDeviceTest {
  private fun fixture(name: String): File {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    return File(instrumentation.targetContext.cacheDir, "qa-$name").also { file ->
      instrumentation.context.assets.open(name).use {source -> file.outputStream().use(source::copyTo)}
    }
  }
  @Test fun playableFileHasExpectedTracksDurationAndSeekableSamples() {
    val file = fixture("content.mp4")
    try {val result = MediaVerifier.verify(file, "video", "muxed", 6000)!!; assertTrue(result.video); assertTrue(result.audio); assertEquals(360, result.height)} finally {file.delete()}
  }
  @Test fun missingAudioFailsWhenAudioWasPromised() {
    val file = fixture("silent.mp4")
    try {assertThrows(Exception::class.java) {MediaVerifier.verify(file, "video", "muxed", 6000)}} finally {file.delete()}
  }
  @Test fun htmlAndTruncatedFilesCannotCompleteAsVideos() {
    val file = fixture("content.mp4")
    try {
      file.writeBytes(file.readBytes().copyOf(128))
      assertThrows(Exception::class.java) {MediaVerifier.verify(file, "video", "muxed", 6000)}
      file.writeText("<!doctype html><html>Login required</html>")
      assertThrows(Exception::class.java) {MediaVerifier.verify(file, "video", "unknown", 0)}
    } finally {file.delete()}
  }
  @Test fun urlSharingDropsAllQueriesAndCredentials() {
    assertEquals("https://example.test/watch", Telemetry.shareableLink("https://example.test/watch?secret=unrecognized&v=123#fragment"))
    assertNull(Telemetry.shareableLink("https://user:password@example.test/watch"))
    assertNull(Telemetry.shareableLink("file:///data/private"))
  }
}
