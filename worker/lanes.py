"""Concurrency lanes: how many generations one account may have running at once.

This is NOT primarily a plan feature, and reading it as one gets the reason backwards.

`/api/generate` is declared `def`, so Starlette runs it — and the background task it
schedules — in anyio's default thread pool. That pool is 40 tokens wide, process-wide, and
nothing in this repo has ever narrowed it. So the real ceiling on simultaneous Gemini calls
has always been "40", and `main._spend_today_usd` documents the consequence in its own
comment: concurrent jobs all read the same stale total and sail past the daily cap together.
`est_cost_usd` is written after ffprobe, i.e. after the request was already admitted, so the
read-then-act window is real. Narrowing the number of runs that can be in flight per account
is what makes that window small enough to stop mattering.

The per-plan numbers are a distant second reason, and are deliberately small: even `internal`
gets 3, because a runaway loop on an unlimited account is exactly how the bill we are
protecting against gets run up (same argument as DAILY_SPEND_CAP_USD applying to internal).

ponytail: an in-process semaphore, per worker process. One Render instance today, so it is
the whole truth. The moment there are two instances this becomes per-instance and the real
ceiling doubles — at which point the lane has to move into the database (a `select ... for
update` over in-flight jobs, or an advisory lock keyed on user_id), not into a bigger number
here.
"""

import logging
import threading

import config

log = logging.getLogger("quink.lanes")

_sems: dict[str, threading.BoundedSemaphore] = {}
_guard = threading.Lock()


def lanes_for(plan: str) -> int:
    return config.LANES.get(plan, config.LANES["free"])


class Lane:
    """Context manager. Blocks until this account has a free lane.

    A job waiting here stays at status 'queued', which is exactly what the dock renders as
    "2 in line" — the wait is visible rather than looking like a stall.
    """

    def __init__(self, user_id: str | None, lanes: int):
        self.user_id = user_id
        self.lanes = max(1, lanes)
        self._sem: threading.BoundedSemaphore | None = None

    def __enter__(self):
        # No user means an inline call (the self-check suite). Nothing to serialise against.
        if not self.user_id:
            return self
        with _guard:
            sem = _sems.get(self.user_id)
            if sem is None:
                sem = threading.BoundedSemaphore(self.lanes)
                _sems[self.user_id] = sem
        self._sem = sem
        if not sem.acquire(blocking=False):
            log.info("user %s is at its lane limit (%s) — queueing", self.user_id, self.lanes)
            sem.acquire()
        return self

    def __exit__(self, *_exc):
        if self._sem is not None:
            self._sem.release()
        return False


def _demo() -> None:
    """`python lanes.py` — the only thing worth asserting is that the lane actually holds
    a second runner out while the first is inside, and lets it through afterwards."""
    import time

    order: list[str] = []

    def run(tag: str) -> None:
        with Lane("u1", 1):
            order.append(f"{tag}-in")
            time.sleep(0.05)
            order.append(f"{tag}-out")

    a = threading.Thread(target=run, args=("a",))
    b = threading.Thread(target=run, args=("b",))
    a.start()
    time.sleep(0.01)
    b.start()
    a.join()
    b.join()

    # Whoever went first must have finished before the other started: no interleaving.
    assert order in (
        ["a-in", "a-out", "b-in", "b-out"],
        ["b-in", "b-out", "a-in", "a-out"],
    ), order

    # A different account is never blocked by this one.
    held = Lane("u2", 1)
    held.__enter__()
    done: list[bool] = []
    t = threading.Thread(target=lambda: (Lane("u3", 1).__enter__(), done.append(True)))
    t.start()
    t.join(timeout=1)
    assert done == [True], "one account's lane must not gate another's"
    held.__exit__()

    print("lanes OK")


if __name__ == "__main__":
    _demo()
