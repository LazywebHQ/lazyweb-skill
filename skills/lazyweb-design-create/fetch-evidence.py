#!/usr/bin/env python3
"""Lazyweb design-research evidence fetcher (v3.4 fast path).

Executes a fixed query plan against the Lazyweb MCP endpoint in parallel and
writes a merged, deduped, coverage-annotated evidence file. Pure stdlib.

Usage:
  fetch-evidence.py --plan plan.json --out work/evidence.json

Plan format (JSON):
  {"skill": "lazyweb-design-create", "version": "0.6.0",
   "queries": [
     {"id": "a1", "pass": "A", "tool": "lazyweb_search",
      "args": {"query": "pricing page", "platform": "desktop", "limit": 15}},
     ...]}

Exit codes:
  0  -> evidence.json written, >=50% of queries succeeded
  2  -> FALLBACK: email missing, initialize failed, or >50% queries failed.
        The skill falls back to agent-driven MCP gathering (v3.3 path).

The bearer is the email recorded by `setup --email` (~/.lazyweb/email): an
identifier, not a secret. Env overrides (tests): LAZYWEB_MCP_URL, LAZYWEB_EMAIL.
"""
import argparse
import concurrent.futures
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

DEFAULT_ENDPOINT = "https://www.lazyweb.com/mcp"
MAX_CONCURRENCY = 6
TIMEOUT_S = 20
PROTOCOL_VERSION = "2025-06-18"

FALLBACK = 2


def log(msg):
    print(msg, file=sys.stderr)


def load_email():
    email = os.environ.get("LAZYWEB_EMAIL", "").strip()
    if email:
        return email
    p = pathlib.Path.home() / ".lazyweb" / "email"
    if p.is_file():
        return p.read_text().strip()
    return ""


def parse_body(raw, content_type):
    """Accept plain JSON or SSE-framed (text/event-stream) JSON-RPC responses."""
    text = raw.decode("utf-8", "replace")
    if "text/event-stream" in (content_type or ""):
        # take the last data: payload that parses as JSON-RPC
        last = None
        for line in text.splitlines():
            if line.startswith("data:"):
                chunk = line[5:].strip()
                if chunk and chunk != "[DONE]":
                    try:
                        last = json.loads(chunk)
                    except ValueError:
                        continue
        return last
    try:
        return json.loads(text)
    except ValueError:
        return None


class McpClient:
    def __init__(self, endpoint, email):
        self.endpoint = endpoint
        self.email = email
        self.session_id = None

    def _post(self, payload, timeout=TIMEOUT_S):
        body = json.dumps(payload).encode()
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Authorization": f"Bearer {self.email}",
        }
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        req = urllib.request.Request(self.endpoint, data=body, headers=headers)
        resp = urllib.request.urlopen(req, timeout=timeout)
        sid = resp.headers.get("Mcp-Session-Id")
        if sid:
            self.session_id = sid
        return parse_body(resp.read(), resp.headers.get("Content-Type"))

    def initialize(self):
        out = self._post({
            "jsonrpc": "2.0", "id": 0, "method": "initialize",
            "params": {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": "lazyweb-fetch-evidence", "version": "1.0"},
            },
        })
        if not out or "result" not in out:
            raise RuntimeError("initialize returned no result")
        # best-effort initialized notification (some servers require it)
        try:
            body = json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}).encode()
            headers = {
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
                "Authorization": f"Bearer {self.email}",
            }
            if self.session_id:
                headers["Mcp-Session-Id"] = self.session_id
            urllib.request.urlopen(
                urllib.request.Request(self.endpoint, data=body, headers=headers),
                timeout=TIMEOUT_S,
            ).read()
        except Exception:
            pass

    def tools_call(self, rpc_id, tool, args):
        attempts = 0
        while True:
            attempts += 1
            try:
                out = self._post({
                    "jsonrpc": "2.0", "id": rpc_id, "method": "tools/call",
                    "params": {"name": tool, "arguments": args},
                })
                if out is None:
                    raise RuntimeError("unparseable response")
                if "error" in out:
                    raise RuntimeError(f"rpc error: {out['error'].get('message', 'unknown')[:200]}")
                return out.get("result", {})
            except urllib.error.HTTPError as exc:
                retryable = exc.code == 429 or exc.code >= 500
                if retryable and attempts == 1:
                    retry_after = exc.headers.get("Retry-After")
                    try:
                        wait = min(float(retry_after), 30.0) if retry_after else 2.0
                    except ValueError:
                        wait = 2.0
                    time.sleep(wait)
                    continue
                raise


def extract_results(result):
    """Normalize a tools/call result into reference dicts.

    Lazyweb returns content[].text JSON or structuredContent; handle both.
    """
    payload = None
    if isinstance(result, dict):
        if isinstance(result.get("structuredContent"), dict):
            payload = result["structuredContent"]
        else:
            for item in result.get("content", []):
                if item.get("type") == "text":
                    try:
                        payload = json.loads(item["text"])
                        break
                    except (ValueError, KeyError):
                        continue
    if payload is None:
        return [], {}
    refs = []
    items = payload.get("results") or payload.get("screenshots") or []
    if isinstance(items, list):
        for r in items:
            if not isinstance(r, dict):
                continue
            refs.append({
                "imageUrl": r.get("imageUrl") or r.get("image_url"),
                "visionDescription": r.get("visionDescription") or r.get("vision_description"),
                "company": r.get("company") or r.get("companyName"),
                "pageUrl": r.get("pageUrl") or r.get("page_url"),
                "platform": r.get("platform"),
                "similarity": r.get("similarity"),
                "matchCount": r.get("matchCount") or r.get("match_count"),
                "siteId": r.get("siteId") or r.get("site_id"),
            })
    meta = {
        "coverage": payload.get("coverage"),
        "warnings": payload.get("warnings"),
        "pagination": payload.get("pagination"),
        # search_ab_tests and friends return prose learnings even when the
        # reference list is empty — surface them instead of hiding behind count:0
        "analysis": payload.get("analysis") or payload.get("summary") or payload.get("learnings"),
    }
    return refs, meta


def dedupe(references):
    """Same-company near-duplicate collapse: keep at most one ref per
    (company, pageUrl) and at most two per company without a distinct page."""
    seen_page = set()
    per_company = {}
    out = []
    for ref in references:
        company = (ref.get("company") or "").strip().lower()
        page = (ref.get("pageUrl") or "").strip().lower()
        key = (company, page)
        if page and key in seen_page:
            continue
        if company:
            per_company.setdefault(company, 0)
            if not page and per_company[company] >= 2:
                continue
            per_company[company] += 1
        if page:
            seen_page.add(key)
        out.append(ref)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--endpoint", default=os.environ.get("LAZYWEB_MCP_URL", DEFAULT_ENDPOINT))
    opts = ap.parse_args()

    email = load_email()
    if not email:
        log("FETCH_FALLBACK: no Lazyweb email found (~/.lazyweb/email)")
        return FALLBACK

    plan = json.loads(pathlib.Path(opts.plan).read_text())
    queries = plan.get("queries", [])
    if not queries:
        log("FETCH_FALLBACK: empty query plan")
        return FALLBACK

    client = McpClient(opts.endpoint, email)
    try:
        client.initialize()
    except Exception as exc:
        log(f"FETCH_FALLBACK: initialize failed: {exc}")
        return FALLBACK

    meta_args = {k: plan[k] for k in ("skill", "version") if k in plan}
    results = {}

    def run_one(idx_query):
        idx, q = idx_query
        args = dict(q.get("args", {}))
        args.update(meta_args)
        started = time.time()
        try:
            result = client.tools_call(idx + 1, q["tool"], args)
            refs, meta = extract_results(result)
            return q["id"], {
                "status": "ok", "tool": q["tool"], "pass": q.get("pass"),
                "args": {k: v for k, v in args.items() if k not in ("image_base64",)},
                "elapsed_s": round(time.time() - started, 2),
                "count": len(refs), "references": refs, **meta,
            }
        except Exception as exc:
            return q["id"], {
                "status": "failed", "tool": q["tool"], "pass": q.get("pass"),
                "error": str(exc)[:300],
                "elapsed_s": round(time.time() - started, 2),
                "count": 0, "references": [],
            }

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_CONCURRENCY) as pool:
        for qid, payload in pool.map(run_one, enumerate(queries)):
            results[qid] = payload

    ok = [q for q in results.values() if q["status"] == "ok"]
    failed = [qid for qid, q in results.items() if q["status"] == "failed"]
    low_coverage = [qid for qid, q in results.items()
                    if q["status"] == "ok" and (
                        (q.get("coverage") in ("low", "low_coverage", "no_matches"))
                        or (q.get("warnings") and any("coverage" in str(w).lower() or "no_match" in str(w).lower()
                                                      for w in (q.get("warnings") or []))))]

    all_refs = [r for q in ok for r in q["references"]]
    deduped = dedupe(all_refs)

    evidence = {
        "endpoint_default": opts.endpoint == DEFAULT_ENDPOINT,
        "queries": results,
        "coverage_summary": {
            "requested": len(queries),
            "succeeded": len(ok),
            "failed": failed,
            "low_coverage": low_coverage,
            "raw_references": len(all_refs),
            "deduped_references": len(deduped),
        },
        "references": deduped,
    }
    out_path = pathlib.Path(opts.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(evidence, indent=1))
    tmp.replace(out_path)

    # Compact companion for the LLM selection pass: no URLs, truncated
    # descriptions. The full file stays the embedding source of truth.
    summary = {
        "coverage_summary": evidence["coverage_summary"],
        "references": [
            {
                "i": i,
                "company": r.get("company"),
                "platform": r.get("platform"),
                "similarity": r.get("similarity"),
                "matchCount": r.get("matchCount"),
                "vd": (r.get("visionDescription") or "")[:180],
            }
            for i, r in enumerate(deduped)
        ],
    }
    sum_path = out_path.with_name(out_path.stem + "-summary.json")
    sum_path.write_text(json.dumps(summary, indent=0))

    if len(ok) * 2 < len(queries):
        log(f"FETCH_FALLBACK: only {len(ok)}/{len(queries)} queries succeeded")
        return FALLBACK
    log(f"FETCH_OK: {len(ok)}/{len(queries)} queries, {len(deduped)} references "
        f"({len(failed)} failed, {len(low_coverage)} low-coverage)")
    # Top-up verdict: when the plan contains expansion/analysis tools, print a
    # one-line verdict so the agent never opens the raw (signed-URL-laden) file.
    if any(q.get("tool") != "lazyweb_search" for q in queries):
        attachable = sum(1 for r in deduped if r.get("visionDescription"))
        analyses = sum(1 for q in results.values() if q.get("analysis"))
        if attachable == 0:
            log(f"TOPUP_SATURATED: 0 of {len(deduped)} returned refs are attachable "
                f"(no visionDescription) — treat as saturation confirmation; "
                f"analysis text: {analyses} (in evidence.json 'analysis' fields)")
        else:
            log(f"TOPUP: {attachable} attachable of {len(deduped)} returned; "
                f"analysis text: {analyses}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
