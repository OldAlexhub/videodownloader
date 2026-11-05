package com.oldalexhub.videodownloader.download

import org.junit.Test
import org.junit.Assert.*
import java.io.IOException

class MediaVerifierTest {
  @Test fun completeTracksMatchSelection() {
    MediaVerifier.requireTracks(VerifiedMedia(true,true,6000,640,360), "video", "muxed", 6000)
  }
  @Test fun silentVideoIsValidOnlyWhenSelectedAsSilent() {
    MediaVerifier.requireTracks(VerifiedMedia(true,false,6000,640,360), "video", "none", 6000)
    assertThrows(IOException::class.java) {MediaVerifier.requireTracks(VerifiedMedia(true,false,6000,640,360), "video", "muxed", 6000)}
  }
  @Test fun missingVideoAndWrongDurationAreRejected() {
    assertThrows(IOException::class.java) {MediaVerifier.requireTracks(VerifiedMedia(false,true,6000,0,0), "video", "muxed", 6000)}
    assertThrows(IOException::class.java) {MediaVerifier.requireTracks(VerifiedMedia(true,true,2000,640,360), "video", "muxed", 60000)}
  }
}
