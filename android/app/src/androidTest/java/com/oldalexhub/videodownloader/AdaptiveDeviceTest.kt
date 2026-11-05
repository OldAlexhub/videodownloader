package com.oldalexhub.videodownloader

import android.content.ContentValues
import androidx.test.platform.app.InstrumentationRegistry
import com.oldalexhub.videodownloader.download.AdaptiveExporter
import com.oldalexhub.videodownloader.download.DownloadDatabase
import com.oldalexhub.videodownloader.download.MediaVerifier
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.util.UUID

class AdaptiveDeviceTest {
  private fun exportFixture(extension: String) {
    val base = InstrumentationRegistry.getArguments().getString("fixtureUrl")
    assumeTrue("Requires local QA fixture server", base != null)
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val source = "$base/media/content.$extension"
    val selected = AdaptiveExporter.inspect(context, source, emptyMap()).first()
    assertEquals(360, selected.height)
    assertTrue("Fixture audio was not found", selected.hasAudio)
    val id = "qa-" + UUID.randomUUID()
    val database = DownloadDatabase.get(context)
    val output = File(context.cacheDir, "$id.mp4")
    database.insert(ContentValues().apply {
      put("id", id); put("source_url", source); put("title", "QA adaptive export")
      put("original_filename", "$id.mp4"); put("final_filename", "$id.mp4")
      put("mime_type", "video/mp4"); put("extension", "mp4"); put("media_type", "video")
      put("status", "paused"); put("created_at", System.currentTimeMillis())
      put("resolution", "360p"); put("audio_mode", selected.audioMode)
      put("selection_token", selected.selectionToken); put("protocol", if (extension == "mpd") "dash" else "hls")
      put("duration_ms", 6000)
    })
    try {
      val record = database.get(id)!!
      val deadline = System.currentTimeMillis() + 45000
      AdaptiveExporter.export(context, record, output, {System.currentTimeMillis() > deadline}, {})
      val verified = MediaVerifier.verify(output, "video", selected.audioMode, 6000)!!
      assertTrue(verified.video); assertTrue(verified.audio); assertEquals(360, verified.height)
      // A mismatched selected track must be actionable, never silently replaced by another quality.
      assertThrows(Exception::class.java) {
        AdaptiveExporter.export(context, record.copy(selectionToken = record.selectionToken!!.replace("group:0", "group:999")), output, {System.currentTimeMillis() > deadline}, {})
      }
    } finally {output.delete(); database.delete(id)}
  }
  @Test fun hlsExportsSelectedVideoAudioAndSeekableFile() = exportFixture("m3u8")
  @Test fun dashExportsSelectedVideoAudioAndSeekableFile() = exportFixture("mpd")
}
