"""Environment coherence — `python test_env.py`. No network, no DB.

The rules in main._assert_env_coherent() are the ones whose failure mode is INVISIBLE:
a staging worker that mails a real customer, or a production worker that swallows every
customer email into one inbox, both look like healthy services. So each rule gets an
assertion here, and each is driven the way a deploy drives it — through the environment.

APP_ENV's own absence cannot be tested in-process (config reads it at import), so it is
exercised as a subprocess: that IS the boot failure, and it has to be the real one.
"""

import os
import subprocess
import sys

import config
import main


def _expect(fragment: str) -> None:
    try:
        main._assert_env_coherent()
    except RuntimeError as e:
        assert fragment in str(e), f"expected {fragment!r} in: {e}"
        return
    raise AssertionError(f"expected a refusal mentioning {fragment!r}")


def demo() -> None:
    saved = (config.APP_ENV, config.IS_PRODUCTION, config.EMAIL_REDIRECT_TO,
             config.DAILY_SPEND_CAP_USD)
    razorpay = os.environ.pop("RAZORPAY_KEY_ID", None)
    try:
        # --- a coherent production worker boots, silently ------------------------------
        config.APP_ENV, config.IS_PRODUCTION = "production", True
        config.EMAIL_REDIRECT_TO, config.DAILY_SPEND_CAP_USD = "", 5.0
        main._assert_env_coherent()

        # …and production is NOT subject to the staging spend ceiling.
        config.DAILY_SPEND_CAP_USD = 5.0
        main._assert_env_coherent()

        # --- an unknown environment is refused, not treated as "not production" --------
        config.APP_ENV, config.IS_PRODUCTION = "prod", False
        _expect("APP_ENV")
        config.APP_ENV, config.IS_PRODUCTION = "", False
        _expect("APP_ENV")

        # --- staging without the mail catch-all can reach a real customer -------------
        config.APP_ENV, config.IS_PRODUCTION = "staging", False
        config.EMAIL_REDIRECT_TO, config.DAILY_SPEND_CAP_USD = "", 2.0
        _expect("EMAIL_REDIRECT_TO")

        # --- production WITH it swallows every customer email -------------------------
        config.APP_ENV, config.IS_PRODUCTION = "production", True
        config.EMAIL_REDIRECT_TO = "dev@example.com"
        _expect("EMAIL_REDIRECT_TO")

        # --- staging may not spend production money -----------------------------------
        config.APP_ENV, config.IS_PRODUCTION = "staging", False
        config.EMAIL_REDIRECT_TO, config.DAILY_SPEND_CAP_USD = "dev@example.com", 5.0
        _expect("DAILY_SPEND_CAP_USD")
        config.DAILY_SPEND_CAP_USD = 2.0
        main._assert_env_coherent()  # at the ceiling is fine

        # --- a LIVE Razorpay key on staging ------------------------------------------
        # No key configured -> the rule is skipped entirely (it is today's state).
        main._assert_env_coherent()
        os.environ["RAZORPAY_KEY_ID"] = "rzp_live_abc123"
        _expect("RAZORPAY_KEY_ID")
        os.environ["RAZORPAY_KEY_ID"] = "rzp_test_abc123"
        main._assert_env_coherent()
        # A secret is not an rzp_ key and must not be mistaken for one.
        os.environ["RAZORPAY_KEY_SECRET"] = "someOpaqueSecret"
        main._assert_env_coherent()
        os.environ.pop("RAZORPAY_KEY_SECRET")
    finally:
        (config.APP_ENV, config.IS_PRODUCTION, config.EMAIL_REDIRECT_TO,
         config.DAILY_SPEND_CAP_USD) = saved
        os.environ.pop("RAZORPAY_KEY_ID", None)
        if razorpay is not None:
            os.environ["RAZORPAY_KEY_ID"] = razorpay

    # --- APP_ENV missing is an IMPORT failure, and has to stay one ---------------------
    # dotenv would supply it from worker/.env, so the subprocess runs with loading disabled.
    env = {k: v for k, v in os.environ.items() if k != "APP_ENV"}
    env["DOTENV_PATH_DISABLED"] = "1"
    r = subprocess.run(
        [sys.executable, "-c",
         "import dotenv; dotenv.load_dotenv = lambda *a, **k: False; import config"],
        cwd=os.path.dirname(os.path.abspath(__file__)),
        env=env, capture_output=True, text=True,
    )
    assert r.returncode != 0, "config must not import without APP_ENV"
    assert "APP_ENV" in r.stderr, r.stderr

    print("env self-check OK")


if __name__ == "__main__":
    demo()
