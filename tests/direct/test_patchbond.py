import hashlib
import json
import sys
import pytest
from conftest import AFTER, BASE, HEAD, HEAD2, ID, NOW, WORKFLOW, addr, iso, mock, submit, terms


def test_accept_review_finalize_and_accounting(direct_vm, scenario):
    c = submit(direct_vm, scenario)
    r = c.get_job(ID)["reviews"][0]
    encoded = json.dumps(r["evidence"], sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    assert r["evidence_hash"] == hashlib.sha256(encoded).hexdigest()
    assert r["evidence_bytes"] == len(encoded)
    c.review_patch(ID, 1)
    with direct_vm.expect_revert("not ready"):
        c.finalize(ID)
    direct_vm.warp(iso(NOW + 600))
    c.finalize(ID)
    assert c.get_job(ID)["status"] == "ACCEPTED"
    a = c.get_accounting(addr(scenario[2]))
    assert a == {"deposited": str(10**16), "locked": "0", "credited": str(10**16), "withdrawn": "0", "claimable": str(10**16)}
    with direct_vm.expect_revert("not ready"):
        c.finalize(ID)


def test_authority_and_duplicate_acceptance(direct_vm, scenario, direct_charlie):
    c = scenario[0]
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("assigned author"):
        c.accept_job(ID)
    direct_vm.sender = scenario[2]
    c.accept_job(ID)
    with direct_vm.expect_revert("window closed"):
        c.accept_job(ID)
    direct_vm.sender = scenario[1]
    with direct_vm.expect_revert("assigned author"):
        c.submit_patch(ID, HEAD, 100, 1)


@pytest.mark.parametrize("override,reason", [
    ({"run": {"head_sha": BASE}}, "another patch"),
    ({"run": {"workflow_id": 666}}, "workflow identity"),
    ({"run": {"run_attempt": 2}}, "run identity"),
    ({"run": {"event": "pull_request_target"}}, "push workflow"),
    ({"run": {"status": "in_progress"}}, "complete successfully"),
    ({"run": {"conclusion": "failure"}}, "complete successfully"),
    ({"run": {"repository": {"id": 88}}}, "authority mismatch"),
    ({"run": {"run_started_at": iso(NOW - 1)}}, "stale"),
    ({"workflow": WORKFLOW + "# changed"}, "workflow changed"),
    ({"commit": {"parents": [{"sha": "f" * 40}]}}, "single commit"),
    ({"commit": {"files": [{"filename": ".github/workflows/ci.yml", "status": "modified"}]}}, "outside frozen scope"),
    ({"commit": {"files": [{"filename": "src/orders.py", "status": "added"}]}}, "existing files"),
    ({"jobs": {"total_count": 2}}, "incomplete"),
    ({"jobs": {"total_count": 0, "jobs": []}}, "incomplete"),
])
def test_ci_provenance_fails_closed(direct_vm, scenario, override, reason):
    c = scenario[0]
    direct_vm.sender = scenario[2]
    c.accept_job(ID)
    mock(direct_vm, **override)
    with direct_vm.expect_revert(reason):
        c.submit_patch(ID, HEAD, 100, 1)
    assert c.get_job(ID)["revision"] == 0


def test_single_challenge_and_fresh_window(direct_vm, scenario):
    c = submit(direct_vm, scenario)
    c.review_patch(ID, 1)
    direct_vm.warp(iso(NOW + 590))
    c.challenge_review(ID, 1, "Check the original idempotency requirement again.")
    assert c.get_job(ID)["challenge_until"] == NOW + 1190
    with direct_vm.expect_revert("already used"):
        c.challenge_review(ID, 1, "Again")
    with direct_vm.expect_revert("not ready"):
        c.finalize(ID)
    direct_vm.warp(iso(NOW + 1190))
    c.finalize(ID)
    assert len(c.get_job(ID)["reviews"][0]["assessments"]) == 2


def test_correction_preserves_first_record(direct_vm, scenario):
    c = submit(direct_vm, scenario)
    original = c.get_job(ID)["reviews"][0]["evidence_hash"]
    mock(direct_vm, status="CONTRADICTED")
    c.review_patch(ID, 1)
    direct_vm.warp(iso(NOW + 600))
    c.finalize(ID)
    assert c.get_job(ID)["status"] == "CHANGES_REQUESTED"
    mock(direct_vm, head=HEAD2, run_id=200)
    c.submit_patch(ID, HEAD2, 200, 1)
    c.review_patch(ID, 2)
    direct_vm.warp(iso(NOW + 1200))
    c.finalize(ID)
    job = c.get_job(ID)
    assert job["status"] == "ACCEPTED" and len(job["reviews"]) == 2
    assert job["reviews"][0]["evidence_hash"] == original
    assert job["reviews"][0]["outcome"] == "CHANGES_REQUESTED"


def test_second_failed_revision_refunds(direct_vm, scenario):
    c = submit(direct_vm, scenario)
    mock(direct_vm, status="CONTRADICTED")
    c.review_patch(ID, 1)
    direct_vm.warp(iso(NOW + 600))
    c.finalize(ID)
    mock(direct_vm, head=HEAD2, run_id=200, status="CONTRADICTED")
    c.submit_patch(ID, HEAD2, 200, 1)
    c.review_patch(ID, 2)
    direct_vm.warp(iso(NOW + 1200))
    c.finalize(ID)
    assert c.get_job(ID)["status"] == "REFUNDED"
    assert c.get_accounting(addr(scenario[1]))["claimable"] == str(10**16)


def test_inconclusive_is_not_accepted(direct_vm, scenario):
    c = submit(direct_vm, scenario)
    mock(direct_vm, status="INSUFFICIENT", quote="")
    c.review_patch(ID, 1)
    assert c.get_job(ID)["reviews"][0]["outcome"] == "INCONCLUSIVE"


def test_fake_quotes_and_changed_evidence_rejected(direct_vm, scenario):
    c = submit(direct_vm, scenario)
    mock(direct_vm, quote="This is not in the code")
    with direct_vm.expect_revert("LLM_ERROR"):
        c.review_patch(ID, 1)
    mock(direct_vm, after=AFTER + "# changed")
    with direct_vm.expect_revert("evidence changed"):
        c.review_patch(ID, 1)
    assert c.get_job(ID)["status"] == "REVIEW_READY"


def test_pending_acceptance_cannot_be_expiry_refunded(direct_vm, scenario):
    c = submit(direct_vm, scenario)
    c.review_patch(ID, 1)
    direct_vm.warp(iso(NOW + 200000))
    with direct_vm.expect_revert("finalize instead"):
        c.recover_expired(ID)
    c.finalize(ID)
    assert c.get_job(ID)["status"] == "ACCEPTED"


@pytest.mark.parametrize("phase,seconds", [("open", 1200), ("accepted", 3600), ("submitted", 90000)])
def test_timeout_recovery(direct_vm, scenario, phase, seconds):
    c = scenario[0]
    direct_vm.sender = scenario[2]
    if phase != "open":
        c.accept_job(ID)
    if phase == "submitted":
        c.submit_patch(ID, HEAD, 100, 1)
    with direct_vm.expect_revert("not reached"):
        c.recover_expired(ID)
    direct_vm.warp(iso(NOW + seconds))
    c.recover_expired(ID)
    assert c.get_job(ID)["status"] == "REFUNDED"
    with direct_vm.expect_revert("Settled"):
        c.recover_expired(ID)


def test_duplicate_commit_and_stale_revision(direct_vm, scenario):
    c = submit(direct_vm, scenario)
    with direct_vm.expect_revert("Stale revision"):
        c.review_patch(ID, 2)
    mock(direct_vm, status="CONTRADICTED")
    c.review_patch(ID, 1)
    direct_vm.warp(iso(NOW + 600))
    c.finalize(ID)
    with direct_vm.expect_revert("Duplicate"):
        c.submit_patch(ID, HEAD, 100, 1)


def test_validator_independently_recomputes(direct_vm, scenario, monkeypatch):
    c = submit(direct_vm, scenario)
    module = next(m for m in tuple(sys.modules.values()) if getattr(m, "VERSION", None) == "patchbond.v0.1" and hasattr(m, "assess"))
    job = c.get_job(ID)
    bad = {"scope_ok": True, "checks": [{"id": "R1", "status": "CONTRADICTED", "reason": "Disagreement", "quote": ""}], "outcome": "CHANGES_REQUESTED"}
    def simulate(leader, validator):
        assert validator(module.gl.vm.Return(bad)) is False
        good = leader()
        assert validator(module.gl.vm.Return(good)) is True
        forged = dict(good, outcome="CHANGES_REQUESTED")
        assert validator(module.gl.vm.Return(forged)) is False
        return good
    monkeypatch.setattr(module.gl.vm, "run_nondet_unsafe", simulate)
    assert module.assess(job, job["reviews"][0], "")["outcome"] == "ACCEPTED"


def test_withdraw_consumes_credit_once_and_targets_author(direct_vm, scenario, monkeypatch):
    c = submit(direct_vm, scenario)
    c.review_patch(ID, 1)
    direct_vm.warp(iso(NOW + 600))
    c.finalize(ID)
    module = next(m for m in tuple(sys.modules.values()) if getattr(m, "VERSION", None) == "patchbond.v0.1" and hasattr(m, "Recipient"))
    messages = []
    class CaptureRecipient:
        def __init__(self, address):
            self.address = str(address).lower()
        def emit_transfer(self, *, value):
            # This asserts local accounting and message intent, not EVM delivery.
            messages.append((self.address, int(value)))
    monkeypatch.setattr(module, "Recipient", CaptureRecipient)
    direct_vm.sender = scenario[1]
    with direct_vm.expect_revert("No claimable"):
        c.withdraw()
    direct_vm.sender = scenario[2]
    c.withdraw()
    assert messages == [(addr(scenario[2]), 10**16)]
    assert c.get_accounting(addr(scenario[2])) == {"deposited": str(10**16), "locked": "0", "credited": "0", "withdrawn": str(10**16), "claimable": "0"}
    with direct_vm.expect_revert("No claimable"):
        c.withdraw()
    assert len(messages) == 1


@pytest.mark.parametrize("change,reason", [
    ({"unexpected": "field"}, "Unexpected"),
    ({"requirements": []}, "requirements"),
    ({"requirements": ["same", "same"]}, "Duplicate requirement"),
    ({"allowed_paths": ["../secrets"]}, "path"),
    ({"allowed_paths": [".github/workflows/ci.yml"]}, "Workflow paths"),
    ({"base_sha": "main"}, "commit/hash"),
    ({"workflow_sha256": "f" * 64}, "Workflow commitment"),
    ({"workflow_bytes": len(WORKFLOW.encode()) + 1}, "Workflow commitment"),
    ({"accept_by": NOW + 1}, "acceptance deadline"),
    ({"submit_by": NOW + 1201}, "submission deadline"),
])
def test_invalid_commitment_terms(direct_vm, direct_deploy, direct_alice, direct_bob, change, reason):
    mock(direct_vm)
    c = direct_deploy("contracts/patch_bond.py")
    direct_vm.sender = direct_alice
    direct_vm.deal(direct_alice, 10**18)
    direct_vm.value = 10**16
    with direct_vm.expect_revert(reason):
        c.create_job(json.dumps(dict(terms(direct_bob), **change)))
    direct_vm.value = 0
    assert c.list_jobs() == []
