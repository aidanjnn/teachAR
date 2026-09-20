"""Public, opt-in browser telemetry configuration; never return server secrets."""
import math
import os
import re


def public_config(env=None):
    env = os.environ if env is None else env
    result = dict(enabled=False, dsn="", replay_enabled=False,
                  environment="development", release="development-uncommitted",
                  traces_sample_rate=1.0)
    if env.get("SENTRY_ENABLED", "false").lower() != "true":
        return result
    dsn = env.get("SENTRY_BROWSER_DSN", "").strip()
    # Restrict this development integration to Sentry's hosted public ingest DSNs.
    # Auth tokens and DSNs containing a secret, query, or fragment are not public config.
    if not re.fullmatch(r"https://[a-fA-F0-9]{16,64}@(?:o\d+\.)?ingest(?:\.[a-z0-9-]+)?\.sentry\.io/\d+", dsn):
        return result
    environment = env.get("SENTRY_ENVIRONMENT", "hackathon-demo")
    release = env.get("SENTRY_RELEASE", env.get("BUILD_ID", "development-uncommitted"))
    if not re.fullmatch(r"[a-zA-Z0-9._-]{1,32}", environment):
        return result
    if not re.fullmatch(r"[a-zA-Z0-9._@+/-]{1,128}", release):
        return result
    try:
        sample_rate = float(env.get("SENTRY_TRACES_SAMPLE_RATE", "1"))
    except (ValueError, TypeError):
        return result
    if not math.isfinite(sample_rate) or not 0 <= sample_rate <= 1:
        return result
    result.update(enabled=True, dsn=dsn,
                  replay_enabled=env.get("SENTRY_REPLAY_ENABLED", "false").lower() == "true",
                  environment=environment, release=release, traces_sample_rate=sample_rate)
    return result
