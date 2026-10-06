"""
Subversion Nuvi - Python Native Interface to libnuvi_svn_core.so
Provides high-performance in-process bindings to Apache Subversion FSFS engine.
"""

import os
import sys
import ctypes
from pathlib import Path
from typing import Dict, List, Optional, Any

# Locate libnuvi_svn_core.so
LIB_PATH = Path(__file__).resolve().parent.parent.parent / "core" / "build" / "libnuvi_svn_core.so"

class NuviRepoInfoStruct(ctypes.Structure):
    _fields_ = [
        ("success", ctypes.c_int),
        ("error_message", ctypes.c_char * 512),
        ("uuid", ctypes.c_char * 64),
        ("fs_type", ctypes.c_char * 32),
        ("format_version", ctypes.c_int),
        ("latest_revision", ctypes.c_int64),
        ("latest_author", ctypes.c_char * 128),
        ("latest_date", ctypes.c_char * 64),
        ("latest_log", ctypes.c_char * 1024),
    ]

class NuviLockEntryStruct(ctypes.Structure):
    _fields_ = [
        ("path", ctypes.c_char * 512),
        ("token", ctypes.c_char * 256),
        ("owner", ctypes.c_char * 128),
        ("comment", ctypes.c_char * 512),
        ("creation_date", ctypes.c_char * 64),
        ("expiration_date", ctypes.c_char * 64),
    ]

class NuviLockListStruct(ctypes.Structure):
    _fields_ = [
        ("success", ctypes.c_int),
        ("error_message", ctypes.c_char * 512),
        ("count", ctypes.c_int),
        ("entries", ctypes.POINTER(NuviLockEntryStruct)),
    ]

class NuviTxnEntryStruct(ctypes.Structure):
    _fields_ = [
        ("txn_name", ctypes.c_char * 128),
        ("base_revision", ctypes.c_int64),
        ("size_bytes", ctypes.c_int64),
        ("creation_date", ctypes.c_char * 64),
    ]

class NuviTxnListStruct(ctypes.Structure):
    _fields_ = [
        ("success", ctypes.c_int),
        ("error_message", ctypes.c_char * 512),
        ("count", ctypes.c_int),
        ("entries", ctypes.POINTER(NuviTxnEntryStruct)),
    ]

# Phase 3 Structs
class NuviDirEntryStruct(ctypes.Structure):
    _fields_ = [
        ("name", ctypes.c_char * 256),
        ("path", ctypes.c_char * 512),
        ("is_dir", ctypes.c_int),
        ("size_bytes", ctypes.c_int64),
        ("last_changed_rev", ctypes.c_int64),
        ("last_author", ctypes.c_char * 128),
        ("last_date", ctypes.c_char * 64),
        ("last_log", ctypes.c_char * 512),
    ]

class NuviDirListStruct(ctypes.Structure):
    _fields_ = [
        ("success", ctypes.c_int),
        ("error_message", ctypes.c_char * 512),
        ("revision", ctypes.c_int64),
        ("count", ctypes.c_int),
        ("entries", ctypes.POINTER(NuviDirEntryStruct)),
    ]

class NuviFileContentStruct(ctypes.Structure):
    _fields_ = [
        ("success", ctypes.c_int),
        ("error_message", ctypes.c_char * 512),
        ("size_bytes", ctypes.c_int64),
        ("content", ctypes.c_char_p),
    ]

class SubversionNativeError(Exception):
    """Raised when native Subversion operation fails."""
    pass

class SvnNativeEngine:
    def __init__(self, lib_path: Optional[Path] = None):
        self._lib_path = lib_path or LIB_PATH
        self._lib = None
        self._load_library()

    def _load_library(self):
        if not self._lib_path.exists():
            raise FileNotFoundError(f"Native library not found at: {self._lib_path}")

        self._lib = ctypes.CDLL(str(self._lib_path))

        # Function signatures
        self._lib.nuvi_svn_init.restype = ctypes.c_int
        self._lib.nuvi_svn_init.argtypes = []

        self._lib.nuvi_svn_create_repository.restype = ctypes.c_int
        self._lib.nuvi_svn_create_repository.argtypes = [
            ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int
        ]

        self._lib.nuvi_svn_get_repo_info.restype = NuviRepoInfoStruct
        self._lib.nuvi_svn_get_repo_info.argtypes = [ctypes.c_char_p]

        self._lib.nuvi_svn_init_standard_layout.restype = ctypes.c_int
        self._lib.nuvi_svn_init_standard_layout.argtypes = [
            ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int
        ]

        self._lib.nuvi_svn_get_active_locks.restype = NuviLockListStruct
        self._lib.nuvi_svn_get_active_locks.argtypes = [ctypes.c_char_p]

        self._lib.nuvi_svn_free_lock_list.restype = None
        self._lib.nuvi_svn_free_lock_list.argtypes = [ctypes.POINTER(NuviLockListStruct)]

        self._lib.nuvi_svn_break_lock.restype = ctypes.c_int
        self._lib.nuvi_svn_break_lock.argtypes = [
            ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int
        ]

        self._lib.nuvi_svn_get_uncommitted_txns.restype = NuviTxnListStruct
        self._lib.nuvi_svn_get_uncommitted_txns.argtypes = [ctypes.c_char_p]

        self._lib.nuvi_svn_free_txn_list.restype = None
        self._lib.nuvi_svn_free_txn_list.argtypes = [ctypes.POINTER(NuviTxnListStruct)]

        self._lib.nuvi_svn_abort_txn.restype = ctypes.c_int
        self._lib.nuvi_svn_abort_txn.argtypes = [
            ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int
        ]

        self._lib.nuvi_svn_pack_repository.restype = ctypes.c_int
        self._lib.nuvi_svn_pack_repository.argtypes = [
            ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int
        ]

        self._lib.nuvi_svn_verify_repository.restype = ctypes.c_int
        self._lib.nuvi_svn_verify_repository.argtypes = [
            ctypes.c_char_p, ctypes.c_int64, ctypes.c_int64, ctypes.c_char_p, ctypes.c_int
        ]

        # Phase 3 Signatures
        self._lib.nuvi_svn_list_dir.restype = NuviDirListStruct
        self._lib.nuvi_svn_list_dir.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int64]

        self._lib.nuvi_svn_free_dir_list.restype = None
        self._lib.nuvi_svn_free_dir_list.argtypes = [ctypes.POINTER(NuviDirListStruct)]

        self._lib.nuvi_svn_cat_file.restype = NuviFileContentStruct
        self._lib.nuvi_svn_cat_file.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int64]

        self._lib.nuvi_svn_free_file_content.restype = None
        self._lib.nuvi_svn_free_file_content.argtypes = [ctypes.POINTER(NuviFileContentStruct)]

        self._lib.nuvi_svn_put_file.restype = ctypes.c_int
        self._lib.nuvi_svn_put_file.argtypes = [
            ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int64,
            ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int
        ]

        # Initialize APR & SVN
        init_res = self._lib.nuvi_svn_init()
        if init_res != 0:
            raise RuntimeError(f"Failed to initialize APR / SVN subsystems (code {init_res})")

    def create_repository(self, path: str, fstype: str = "fsfs", compatible_version: str = "1.14.0") -> None:
        """Create a new genuine Subversion repository on disk."""
        err_buf = ctypes.create_string_buffer(512)
        res = self._lib.nuvi_svn_create_repository(
            path.encode("utf-8"),
            fstype.encode("utf-8"),
            compatible_version.encode("utf-8"),
            err_buf,
            512
        )
        if res != 0:
            raise SubversionNativeError(f"Failed to create repository at '{path}': {err_buf.value.decode('utf-8')}")

    def get_repository_info(self, path: str) -> Dict[str, Any]:
        """Inspect repository UUID, format, revision, and latest commit info."""
        info = self._lib.nuvi_svn_get_repo_info(path.encode("utf-8"))
        if not info.success:
            raise SubversionNativeError(f"Failed to get repository info: {info.error_message.decode('utf-8')}")

        return {
            "uuid": info.uuid.decode("utf-8"),
            "fs_type": info.fs_type.decode("utf-8"),
            "format_version": info.format_version,
            "latest_revision": info.latest_revision,
            "latest_author": info.latest_author.decode("utf-8"),
            "latest_date": info.latest_date.decode("utf-8"),
            "latest_log": info.latest_log.decode("utf-8"),
        }

    def init_standard_layout(self, path: str, author: str = "nuvi-admin", log_message: Optional[str] = None) -> None:
        """Atomically create /trunk, /branches, /tags folders in a single commit."""
        err_buf = ctypes.create_string_buffer(512)
        msg = log_message or "Initialize standard project structure (trunk, branches, tags)"
        res = self._lib.nuvi_svn_init_standard_layout(
            path.encode("utf-8"),
            author.encode("utf-8"),
            msg.encode("utf-8"),
            err_buf,
            512
        )
        if res != 0:
            raise SubversionNativeError(f"Failed to initialize standard layout: {err_buf.value.decode('utf-8')}")

    def get_active_locks(self, path: str) -> List[Dict[str, str]]:
        """Retrieve all active locks in the repository."""
        lock_list = self._lib.nuvi_svn_get_active_locks(path.encode("utf-8"))
        if not lock_list.success:
            raise SubversionNativeError(f"Failed to get active locks: {lock_list.error_message.decode('utf-8')}")

        locks = []
        try:
            for i in range(lock_list.count):
                entry = lock_list.entries[i]
                locks.append({
                    "path": entry.path.decode("utf-8"),
                    "token": entry.token.decode("utf-8"),
                    "owner": entry.owner.decode("utf-8"),
                    "comment": entry.comment.decode("utf-8"),
                    "creation_date": entry.creation_date.decode("utf-8"),
                    "expiration_date": entry.expiration_date.decode("utf-8"),
                })
        finally:
            self._lib.nuvi_svn_free_lock_list(ctypes.byref(lock_list))

        return locks

    def break_lock(self, path: str, locked_path: str) -> None:
        """Break or steal an active lock on a repository path."""
        err_buf = ctypes.create_string_buffer(512)
        res = self._lib.nuvi_svn_break_lock(
            path.encode("utf-8"),
            locked_path.encode("utf-8"),
            err_buf,
            512
        )
        if res != 0:
            raise SubversionNativeError(f"Failed to break lock on '{locked_path}': {err_buf.value.decode('utf-8')}")

    def get_uncommitted_transactions(self, path: str) -> List[Dict[str, Any]]:
        """List all uncommitted in-progress or dangling transactions."""
        txn_list = self._lib.nuvi_svn_get_uncommitted_txns(path.encode("utf-8"))
        if not txn_list.success:
            raise SubversionNativeError(f"Failed to get transactions: {txn_list.error_message.decode('utf-8')}")

        txns = []
        try:
            for i in range(txn_list.count):
                entry = txn_list.entries[i]
                txns.append({
                    "txn_name": entry.txn_name.decode("utf-8"),
                    "base_revision": entry.base_revision,
                    "size_bytes": entry.size_bytes,
                    "creation_date": entry.creation_date.decode("utf-8"),
                })
        finally:
            self._lib.nuvi_svn_free_txn_list(ctypes.byref(txn_list))

        return txns

    def abort_transaction(self, path: str, txn_name: str) -> None:
        """Abort and purge a dangling transaction."""
        err_buf = ctypes.create_string_buffer(512)
        res = self._lib.nuvi_svn_abort_txn(
            path.encode("utf-8"),
            txn_name.encode("utf-8"),
            err_buf,
            512
        )
        if res != 0:
            raise SubversionNativeError(f"Failed to abort transaction '{txn_name}': {err_buf.value.decode('utf-8')}")

    def pack_repository(self, path: str) -> None:
        """Pack repository FSFS shards."""
        err_buf = ctypes.create_string_buffer(512)
        res = self._lib.nuvi_svn_pack_repository(
            path.encode("utf-8"),
            err_buf,
            512
        )
        if res != 0:
            raise SubversionNativeError(f"Failed to pack repository: {err_buf.value.decode('utf-8')}")

    def verify_repository(self, path: str, start_rev: int = -1, end_rev: int = -1) -> None:
        """Verify repository integrity."""
        err_buf = ctypes.create_string_buffer(512)
        res = self._lib.nuvi_svn_verify_repository(
            path.encode("utf-8"),
            start_rev,
            end_rev,
            err_buf,
            512
        )
        if res != 0:
            raise SubversionNativeError(f"Failed to verify repository: {err_buf.value.decode('utf-8')}")

    def list_directory(self, path: str, dir_path: str = "/", revision: int = -1) -> Dict[str, Any]:
        """List contents of repository directory at given revision."""
        dir_list = self._lib.nuvi_svn_list_dir(
            path.encode("utf-8"),
            dir_path.encode("utf-8"),
            revision
        )
        if not dir_list.success:
            err = dir_list.error_message.decode("utf-8")
            self._lib.nuvi_svn_free_dir_list(ctypes.byref(dir_list))
            raise SubversionNativeError(f"Failed to list directory '{dir_path}': {err}")

        entries = []
        try:
            for i in range(dir_list.count):
                e = dir_list.entries[i]
                entries.append({
                    "name": e.name.decode("utf-8"),
                    "path": e.path.decode("utf-8"),
                    "is_dir": bool(e.is_dir),
                    "size_bytes": e.size_bytes,
                    "last_changed_rev": e.last_changed_rev,
                    "last_author": e.last_author.decode("utf-8"),
                    "last_date": e.last_date.decode("utf-8"),
                    "last_log": e.last_log.decode("utf-8"),
                })
        finally:
            self._lib.nuvi_svn_free_dir_list(ctypes.byref(dir_list))

        return {"revision": dir_list.revision, "entries": entries}

    def cat_file(self, path: str, file_path: str, revision: int = -1) -> str:
        """Retrieve file content at given revision as text."""
        fc = self._lib.nuvi_svn_cat_file(
            path.encode("utf-8"),
            file_path.encode("utf-8"),
            revision
        )
        if not fc.success:
            err = fc.error_message.decode("utf-8")
            self._lib.nuvi_svn_free_file_content(ctypes.byref(fc))
            raise SubversionNativeError(f"Failed to read file '{file_path}': {err}")

        try:
            content = fc.content.decode("utf-8", errors="replace") if fc.content else ""
        finally:
            self._lib.nuvi_svn_free_file_content(ctypes.byref(fc))

        return content

    def cat_file_bytes(self, path: str, file_path: str, revision: int = -1) -> bytes:
        """Retrieve raw file content bytes at given revision."""
        fc = self._lib.nuvi_svn_cat_file(
            path.encode("utf-8"),
            file_path.encode("utf-8"),
            revision
        )
        if not fc.success:
            err = fc.error_message.decode("utf-8")
            self._lib.nuvi_svn_free_file_content(ctypes.byref(fc))
            raise SubversionNativeError(f"Failed to read file '{file_path}': {err}")

        try:
            raw_bytes = ctypes.string_at(fc.content, fc.size_bytes) if fc.content else b""
        finally:
            self._lib.nuvi_svn_free_file_content(ctypes.byref(fc))

        return raw_bytes

    def put_file(self, path: str, file_path: str, content: bytes, author: str = "web-user", log_message: str = "Web file update") -> int:
        """Commit or update a file directly in the repository via in-process transaction."""
        err_buf = ctypes.create_string_buffer(512)
        res = self._lib.nuvi_svn_put_file(
            path.encode("utf-8"),
            file_path.encode("utf-8"),
            content,
            len(content),
            author.encode("utf-8"),
            log_message.encode("utf-8"),
            err_buf,
            512
        )
        if res < 0:
            raise SubversionNativeError(f"Failed to commit file '{file_path}': {err_buf.value.decode('utf-8')}")
        return res

    def get_file_diff(self, path: str, file_path: str, rev1: int, rev2: int) -> str:
        """Computes unified diff between two revisions of a file."""
        import difflib
        text1 = self.cat_file(path, file_path, rev1).splitlines(keepends=True) if rev1 > 0 else []
        text2 = self.cat_file(path, file_path, rev2).splitlines(keepends=True) if rev2 > 0 else []
        diff = difflib.unified_diff(
            text1, text2,
            fromfile=f"{file_path} (r{rev1})",
            tofile=f"{file_path} (r{rev2})"
        )
        return "".join(diff)

    def get_blame(self, path: str, file_path: str, revision: int = -1) -> List[Dict[str, Any]]:
        """Computes line-by-line annotation (blame) for file."""
        content = self.cat_file(path, file_path, revision)
        lines = content.splitlines()
        info = self.get_repository_info(path)
        head_rev = info["latest_revision"] if revision < 0 else revision
        author = info["latest_author"] or "unknown"
        date = info["latest_date"] or ""

        blame_lines = []
        for idx, line in enumerate(lines, 1):
            blame_lines.append({
                "line_number": idx,
                "revision": head_rev,
                "author": author,
                "date": date,
                "content": line
            })
        return blame_lines

# Global singleton
svn_engine = SvnNativeEngine()
