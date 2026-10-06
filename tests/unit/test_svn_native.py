"""
Unit tests for Subversion Nuvi Native C++/Python Engine
"""
import os
import shutil
import subprocess
import pytest
from pathlib import Path
from backend.api.services.svn_native import svn_engine, SubversionNativeError

TEST_REPO_PATH = Path("/media/uv/winData/proTEmp/subversion_nuvi/data/repositories/unit_test_repo")

def setup_module(module):
    """Clean up any previous test repository."""
    if TEST_REPO_PATH.exists():
        shutil.rmtree(TEST_REPO_PATH)

def teardown_module(module):
    """Clean up after tests."""
    if TEST_REPO_PATH.exists():
        shutil.rmtree(TEST_REPO_PATH)

def test_create_repository():
    """Verify repository creation with native C API."""
    if TEST_REPO_PATH.exists():
        shutil.rmtree(TEST_REPO_PATH)

    svn_engine.create_repository(str(TEST_REPO_PATH))
    assert TEST_REPO_PATH.exists()
    assert (TEST_REPO_PATH / "format").exists()
    assert (TEST_REPO_PATH / "conf").exists()
    assert (TEST_REPO_PATH / "db").exists()

def test_get_repository_info():
    """Verify metadata inspection of the created repository."""
    info = svn_engine.get_repository_info(str(TEST_REPO_PATH))
    assert info["fs_type"] == "fsfs"
    assert len(info["uuid"]) > 0
    assert info["latest_revision"] == 0

def test_init_standard_layout():
    """Verify atomic initialization of trunk, branches, tags in revision 1."""
    svn_engine.init_standard_layout(
        str(TEST_REPO_PATH),
        author="nuvi-test-admin",
        log_message="Setup initial project structure"
    )

    info = svn_engine.get_repository_info(str(TEST_REPO_PATH))
    assert info["latest_revision"] == 1
    assert info["latest_author"] == "nuvi-test-admin"
    assert "Setup initial project structure" in info["latest_log"]

def test_verify_repository():
    """Verify repository integrity check."""
    # Should not raise any exception
    svn_engine.verify_repository(str(TEST_REPO_PATH))

def test_pack_repository():
    """Verify repository FSFS shard packing."""
    # Should not raise any exception
    svn_engine.pack_repository(str(TEST_REPO_PATH))

def test_active_locks_and_transactions():
    """Verify query for active locks and uncommitted transactions."""
    locks = svn_engine.get_active_locks(str(TEST_REPO_PATH))
    assert isinstance(locks, list)
    assert len(locks) == 0

    txns = svn_engine.get_uncommitted_transactions(str(TEST_REPO_PATH))
    assert isinstance(txns, list)
    assert len(txns) == 0

if __name__ == "__main__":
    setup_module(None)
    test_create_repository()
    print("test_create_repository: PASSED")
    test_get_repository_info()
    print("test_get_repository_info: PASSED")
    test_init_standard_layout()
    print("test_init_standard_layout: PASSED")
    test_verify_repository()
    print("test_verify_repository: PASSED")
    test_pack_repository()
    print("test_pack_repository: PASSED")
    test_active_locks_and_transactions()
    print("test_active_locks_and_transactions: PASSED")
    teardown_module(None)
    print("ALL TESTS PASSED!")
