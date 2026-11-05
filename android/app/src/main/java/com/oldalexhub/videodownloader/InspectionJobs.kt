package com.oldalexhub.videodownloader

import com.facebook.react.bridge.Promise
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicBoolean

object InspectionJobs {
  private val executor = ThreadPoolExecutor(3, 3, 30, TimeUnit.SECONDS, ArrayBlockingQueue(48))
  private val timer = Executors.newSingleThreadScheduledExecutor()
  private data class Job(val future: Future<*>, val cancel: () -> Unit)
  private val jobs = ConcurrentHashMap<String, MutableSet<Job>>()
  fun submit(document: String, promise: Promise, action: () -> Any) {
    val done = AtomicBoolean(false)
    val task = FutureTask<Unit> {
      try {val result = action(); if (done.compareAndSet(false, true)) promise.resolve(result)}
      catch (error: Throwable) {if (done.compareAndSet(false, true)) promise.reject("E_INSPECTION", error.message, error)}
    }
    val job = Job(task) {if (done.compareAndSet(false, true)) promise.reject("E_CANCELLED", "Inspection cancelled"); task.cancel(true)}
    val set = jobs.computeIfAbsent(document) {ConcurrentHashMap.newKeySet()}
    set.add(job)
    try {executor.execute(task)} catch (error: RejectedExecutionException) {set.remove(job); if (done.compareAndSet(false, true)) promise.reject("E_BUSY", "Inspection queue is full"); return}
    timer.schedule({
      if (done.compareAndSet(false, true)) {promise.reject("E_TIMEOUT", "Media inspection timed out"); task.cancel(true)}
      set.remove(job)
      if (set.isEmpty()) jobs.remove(document, set)
    }, 15, TimeUnit.SECONDS)
  }
  fun cancel(document: String) {jobs.remove(document)?.forEach {it.cancel()}; executor.purge()}
}
