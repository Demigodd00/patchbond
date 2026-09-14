import hashlib
import json
import re
import sys
from datetime import datetime, timezone
import pytest

NOW = 2_000_000_000
REPO = "fixture/repair"
BASE, HEAD, HEAD2 = "a" * 40, "b" * 40, "c" * 40
WORKFLOW = "name: PatchBond\non: push\njobs:\n  acceptance:\n    runs-on: ubuntu-latest\n"
BEFORE = "def create_order(key):\n    return new_order(key)\n"
AFTER = "def create_order(key):\n    if key in orders: return orders[key]\n    return new_order(key)\n"
ID = "PB-TEST-001"


def iso(n):
    return datetime.fromtimestamp(n, tz=timezone.utc).isoformat()


def addr(account):
    return "0x" + account.hex()


@pytest.fixture(autouse=True)
def clock(direct_vm):
    original = direct_vm.warp
    def warp(value):
        original(value)
        for m in tuple(sys.modules.values()):
            raw = getattr(getattr(m, "gl", None), "message_raw", None)
            if isinstance(raw, dict) and "datetime" in raw:
                raw["datetime"] = value
    direct_vm.warp = warp
    warp(iso(NOW))


def mock(vm, head=HEAD, run_id=100, status="SUPPORTED", **overrides):
    vm.clear_mocks()
    records = {
      "": {"id": 77, "private": False, "full_name": REPO},
      "/commits/" + BASE: {"sha": BASE},
      "/commits/" + head + "?per_page=100": {"sha": head, "parents": [{"sha": BASE}], "files": [{"filename": "src/orders.py", "status": "modified"}]},
      f"/actions/runs/{run_id}/attempts/1": {"id": run_id, "run_attempt": 1, "head_sha": head, "head_repository": {"id": 77}, "repository": {"id": 77}, "workflow_id": 55, "path": ".github/workflows/ci.yml@main", "event": "push", "status": "completed", "conclusion": "success", "run_started_at": iso(NOW)},
      f"/actions/runs/{run_id}/attempts/1/jobs?per_page=100": {"total_count": 1, "jobs": [{"id": 101, "run_id": run_id, "head_sha": head, "name": "acceptance", "status": "completed", "conclusion": "success", "steps": [{"number": 1, "name": "Acceptance tests", "status": "completed", "conclusion": "success"}]}]}
    }
    run = records[f"/actions/runs/{run_id}/attempts/1"]
    run.update(overrides.get("run", {}))
    records["/commits/" + head + "?per_page=100"].update(overrides.get("commit", {}))
    records[f"/actions/runs/{run_id}/attempts/1/jobs?per_page=100"].update(overrides.get("jobs", {}))
    for suffix, value in records.items():
        vm.mock_web("^" + re.escape("https://api.github.com/repos/" + REPO + suffix) + "$", {"status": 200, "body": json.dumps(value)})
    for commit in (BASE, head):
        workflow = overrides.get("workflow", WORKFLOW) if commit == head else WORKFLOW
        vm.mock_web("^" + re.escape(f"https://raw.githubusercontent.com/{REPO}/{commit}/.github/workflows/ci.yml") + "$", {"status": 200, "body": workflow})
        vm.mock_web("^" + re.escape(f"https://raw.githubusercontent.com/{REPO}/{commit}/src/orders.py") + "$", {"status": 200, "body": BEFORE if commit == BASE else overrides.get("after", AFTER)})
    vm.mock_llm("PATCHBOND_REVIEW_V1", json.dumps({"scope_ok": True, "checks": [{"id": "R1", "status": status, "quote": overrides.get("quote", "if key in orders: return orders[key]"), "reason": "The code returns the prior order for an existing key."}]}))


def terms(author):
    return {"id": ID, "title": "Prevent duplicate orders", "repo": REPO, "base_sha": BASE, "author": addr(author),
            "bug": "Two requests with the same key currently create two orders. Call create_order twice with the same key.",
            "requirements": ["Repeated keys return the original order."], "allowed_paths": ["src/orders.py"],
            "workflow_path": ".github/workflows/ci.yml", "workflow_sha256": hashlib.sha256(WORKFLOW.encode()).hexdigest(),
            "workflow_bytes": len(WORKFLOW.encode()), "workflow_id": 55, "required_job": "acceptance", "accept_by": NOW + 1200, "submit_by": NOW + 3600}


@pytest.fixture
def scenario(direct_vm, direct_deploy, direct_alice, direct_bob):
    mock(direct_vm)
    c = direct_deploy("contracts/patch_bond.py")
    direct_vm.sender = direct_alice
    direct_vm.deal(direct_alice, 10**18)
    direct_vm.value = 10**16
    c.create_job(json.dumps(terms(direct_bob)))
    direct_vm.value = 0
    return c, direct_alice, direct_bob


def submit(vm, scenario):
    c, _, author = scenario
    vm.sender = author
    c.accept_job(ID)
    c.submit_patch(ID, HEAD, 100, 1)
    return c
