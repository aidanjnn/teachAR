"""Single server-owned scheduler: extra browser tabs cannot multiply paid calls."""
import math
import threading
import time


class AutoChecks:
    def __init__(self, clock=time.monotonic):
        self.clock=clock
        self.lock=threading.Lock()
        self.enabled=False
        self.busy=False
        self.next_at=0.
        self.waiting_since=None
        self.message='Automatic AI checks are off.'
        self.generation=0

    def set_enabled(self, enabled):
        if type(enabled) is not bool:
            raise ValueError('enabled must be true or false.')
        with self.lock:
            if self.enabled!=enabled:
                self.generation+=1
                self.enabled=enabled
                self.next_at=self.clock()+10
                self.waiting_since=None
                self.message='Next AI check in 10 seconds.' if enabled else 'Automatic AI checks are off. An already-started request may finish.'

    def status(self):
        with self.lock:
            return dict(enabled=self.enabled,busy=self.busy,
                        countdown_seconds=max(0,math.ceil(self.next_at-self.clock())) if self.enabled else None,
                        message=self.message)

    def tick(self, ready, budget, run):
        with self.lock:
            if not self.enabled or self.busy:
                return
            now=self.clock()
            if not budget.get('enabled'):
                self.enabled=False;self.message='Auto AI stopped: key unavailable, API paused, or allowance exhausted.'
                return
            if not ready:
                if self.waiting_since is None:self.waiting_since=now
                self.message='Waiting for a fresh camera view and saved reference. No API request.'
                if now-self.waiting_since>=30:
                    self.enabled=False;self.message='Auto AI stopped after 30 seconds without a usable camera feed. Turn it on to resume.'
                return
            self.waiting_since=None
            if budget.get('busy'):
                self.message='An AI check is running…';return
            cooldown=budget.get('cooldown_seconds',0)
            if cooldown>0:
                self.next_at=max(self.next_at,now+cooldown+.1)
            if now<self.next_at:
                self.message='Next AI check scheduled.';return
            self.busy=True
            generation=self.generation
            self.next_at=now+10
            self.message='Checking with AI… keep all toys and labels visible.'
        try:
            run()
        except Exception:
            with self.lock:
                if generation==self.generation:
                    self.enabled=False
                    self.message='Auto AI stopped after a check error. See the AI status/error below; no automatic retries.'
        finally:
            with self.lock:
                self.busy=False
                if self.enabled and generation==self.generation:
                    # Never queue catch-up requests after a slow response.
                    self.next_at=max(self.next_at,self.clock()+.5)


def loop(scheduler, readiness, budget_status, run, stop_event):
    while not stop_event.wait(.25):
        try:
            scheduler.tick(readiness(),budget_status(),run)
        except Exception:
            scheduler.set_enabled(False)
