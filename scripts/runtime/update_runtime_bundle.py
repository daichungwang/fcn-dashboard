#!/usr/bin/env python3
"""
Phase B runtime bundle builder (sandbox/staging only).

Safety guarantees:
- Only writes to configured staging artifacts.
- Explicitly blocks writes to production artifacts.
- No modification to existing production pages/engines.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class BuildConfig:
    version: str
    scope: dict[str, Any]
    inputs: dict[str, str]
    artifacts: dict[str, str]
    safety: dict[str, Any]
    fallback_policy: dict[str, Any]


@dataclass
class BuildContext:
    build_id: str
    started_at: str
    symbol_scope: list[str]
    warnings: list[str]
    errors: list[str]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: str, payload: Any) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)


def sha256_of_obj(payload: Any) -> str:
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def load_config(path: str) -> BuildConfig:
    cfg = load_json(path)
    return BuildConfig(
        version=cfg.get("version", "runtime_bundle_config@v1.0.0"),
        scope=cfg.get("scope", {}),
        inputs=cfg.get("inputs", {}),
        artifacts=cfg.get("artifacts", {}),
        safety=cfg.get("safety", {}),
        fallback_policy=cfg.get("fallback_policy", {}),
    )


def resolve_symbol_scope(cfg: BuildConfig) -> list[str]:
    mode = cfg.scope.get("symbol_scope_mode", "pool30")
    custom = [str(s).strip().upper() for s in cfg.scope.get("custom_symbols", []) if str(s).strip()]

    symbols: list[str] = []

    if mode == "custom":
        symbols = custom
    else:
        pool_path = cfg.inputs["pool30_path"]
        pool = load_json(pool_path)
        symbols = [str(x.get("symbol", "")).strip().upper() for x in pool if isinstance(x, dict)]
        symbols = [s for s in symbols if s]

        if mode == "pool30_plus_custom" and custom:
            symbols.extend(custom)

    # de-dup preserve order
    seen = set()
    out = []
    for s in symbols:
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


def fetch_raw_market_history(symbols: list[str], cfg: BuildConfig) -> dict[str, Any]:
    # Phase B intentionally uses existing market_runtime as raw source
    # to avoid touching production fetch scripts.
    market_runtime = load_json(cfg.inputs["market_runtime_path"])
    return {s: market_runtime.get(s, {}) for s in symbols}


def build_fast_runtime(raw_market: dict[str, Any]) -> dict[str, Any]:
    # Pass-through shape for compatibility audit / future expansion.
    # (Not published in Phase B)
    return raw_market


def build_long_term_runtime(raw_market: dict[str, Any], ctx: BuildContext) -> dict[str, Any]:
    symbols_payload: dict[str, Any] = {}

    for symbol, row in raw_market.items():
        if not isinstance(row, dict) or not row:
            ctx.warnings.append(f"{symbol}: missing market runtime row, long-term fields set to null")
            row = {}

        symbols_payload[symbol] = {
            "symbol": symbol,
            "as_of_date": datetime.now(timezone.utc).date().isoformat(),
            "trend": {
                "ret_3y": None,
                "ret_5y": None,
                "ret_10y": None,
                "price_ref_3y": None,
                "price_ref_5y": None,
                "price_ref_10y": None
            },
            "structure": {
                "ma_50": None,
                "ma_200": None,
                "distance_to_ma50": None,
                "distance_to_ma200": None,
                "max_drawdown_3y": None
            },
            "valuation": {
                "pe_percentile_5y": None
            },
            "quality": {
                "eps_cagr_3y": None,
                "eps_cagr_5y": None
            },
            "meta": {
                "data_quality": "partial",
                "updated_at": now_iso(),
                "missing_fields": [
                    "ret_3y", "ret_5y", "ret_10y",
                    "price_ref_3y", "price_ref_5y", "price_ref_10y",
                    "ma_50", "ma_200", "distance_to_ma50", "distance_to_ma200",
                    "max_drawdown_3y", "pe_percentile_5y", "eps_cagr_3y", "eps_cagr_5y"
                ],
                "fallback_source": "data/market_runtime.json"
            }
        }

    return {
        "version": "long_term_runtime@v1.0.0",
        "generated_at": now_iso(),
        "scope": {
            "markets": ["US"],
            "domains": ["FCN", "US_STOCKS"]
        },
        "source": {
            "provider": "market_runtime_seed",
            "pipeline_version": "runtime_bundle@v1.0.0",
            "notes": "Phase B seed output; long-term fields intentionally null/partial"
        },
        "symbols": symbols_payload
    }


def validate_runtime_family(long_term_runtime: dict[str, Any], ctx: BuildContext) -> dict[str, Any]:
    errors = []
    warnings = list(ctx.warnings)

    required_top = ["version", "generated_at", "source", "symbols"]
    for key in required_top:
        if key not in long_term_runtime:
            errors.append(f"missing top-level key: {key}")

    symbols = long_term_runtime.get("symbols", {})
    if not isinstance(symbols, dict):
        errors.append("symbols must be object")
    elif len(symbols) == 0:
        warnings.append("symbols is empty")

    passed = len(errors) == 0
    return {
        "passed": passed,
        "errors": errors,
        "warnings": warnings,
        "error_count": len(errors),
        "warning_count": len(warnings)
    }


def write_runtime_manifest(
    cfg: BuildConfig,
    ctx: BuildContext,
    long_term_runtime: dict[str, Any],
    validation_report: dict[str, Any]
) -> dict[str, Any]:
    artifact_path = cfg.artifacts["long_term_runtime_path"]
    manifest = {
        "bundle_version": "runtime_bundle@v1.0.0",
        "build_id": ctx.build_id,
        "generated_at": now_iso(),
        "config_version": cfg.version,
        "scope": {
            "markets": cfg.scope.get("markets", ["US"]),
            "domains": cfg.scope.get("domains", ["FCN", "US_STOCKS"]),
            "symbol_scope_mode": cfg.scope.get("symbol_scope_mode", "pool30"),
            "symbol_count": len(ctx.symbol_scope)
        },
        "artifacts": [
            {
                "name": "long_term_runtime",
                "path": artifact_path,
                "schema_version": long_term_runtime.get("version", "unknown"),
                "record_count": len(long_term_runtime.get("symbols", {})),
                "checksum_sha256": sha256_of_obj(long_term_runtime)
            }
        ],
        "validation": validation_report,
        "fallback_stats": {
            "warning_count": len(ctx.warnings),
            "error_count": len(ctx.errors)
        },
        "rollback": {
            "can_rollback": False,
            "previous_build_id": None
        }
    }
    return manifest


def publish_artifacts(cfg: BuildConfig, long_term_runtime: dict[str, Any], manifest: dict[str, Any]) -> None:
    if cfg.safety.get("allow_production_write", False):
        raise RuntimeError("Safety violation: allow_production_write must remain false")

    blocklist = set(cfg.safety.get("production_blocklist", []))
    target_paths = [
        cfg.artifacts["long_term_runtime_path"],
        cfg.artifacts["runtime_manifest_path"]
    ]

    for p in target_paths:
        if p in blocklist:
            raise RuntimeError(f"Safety violation: target path is production blocklisted: {p}")

    write_json(cfg.artifacts["long_term_runtime_path"], long_term_runtime)
    write_json(cfg.artifacts["runtime_manifest_path"], manifest)


def main() -> int:
    ctx = BuildContext(
        build_id=f"RB-{uuid.uuid4().hex[:12]}",
        started_at=now_iso(),
        symbol_scope=[],
        warnings=[],
        errors=[]
    )

    try:
        cfg = load_config("configs/runtime_bundle_config.json")
        symbols = resolve_symbol_scope(cfg)
        ctx.symbol_scope = symbols

        raw_market = fetch_raw_market_history(symbols, cfg)
        _fast_runtime = build_fast_runtime(raw_market)
        long_term_runtime = build_long_term_runtime(raw_market, ctx)
        validation = validate_runtime_family(long_term_runtime, ctx)

        if not validation["passed"]:
            raise RuntimeError(f"Validation failed: {validation['errors']}")

        manifest = write_runtime_manifest(cfg, ctx, long_term_runtime, validation)
        publish_artifacts(cfg, long_term_runtime, manifest)

        print(f"✅ runtime bundle build success: {ctx.build_id}")
        print(f"✅ long_term_runtime -> {cfg.artifacts['long_term_runtime_path']}")
        print(f"✅ runtime_manifest -> {cfg.artifacts['runtime_manifest_path']}")
        if validation["warning_count"] > 0:
            print(f"⚠ warnings: {validation['warning_count']}")

        return 0

    except Exception as e:
        print(f"❌ runtime bundle build failed: {e}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
