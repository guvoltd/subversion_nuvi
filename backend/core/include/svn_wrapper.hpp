/**
 * Subversion Nuvi - Native C++ Subversion Core Wrapper
 * Provides high-performance in-process wrappers around libsvn_fs, libsvn_repos, and libapr.
 */

#ifndef NUVI_SVN_WRAPPER_HPP
#define NUVI_SVN_WRAPPER_HPP

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>
#include <stdbool.h>

typedef struct {
    int success;
    char error_message[512];
    char uuid[64];
    char fs_type[32];
    int format_version;
    int64_t latest_revision;
    char latest_author[128];
    char latest_date[64];
    char latest_log[1024];
} NuviRepoInfo;

typedef struct {
    char path[512];
    char token[256];
    char owner[128];
    char comment[512];
    char creation_date[64];
    char expiration_date[64];
} NuviLockEntry;

typedef struct {
    int success;
    char error_message[512];
    int count;
    NuviLockEntry* entries;
} NuviLockList;

typedef struct {
    char txn_name[128];
    int64_t base_revision;
    int64_t size_bytes;
    char creation_date[64];
} NuviTxnEntry;

typedef struct {
    int success;
    char error_message[512];
    int count;
    NuviTxnEntry* entries;
} NuviTxnList;

int nuvi_svn_init(void);
int nuvi_svn_create_repository(const char* path, const char* fstype, const char* compatible_version, char* error_buf, int error_buf_size);
NuviRepoInfo nuvi_svn_get_repo_info(const char* path);
int nuvi_svn_init_standard_layout(const char* path, const char* author, const char* log_message, char* error_buf, int error_buf_size);
NuviLockList nuvi_svn_get_active_locks(const char* path);
void nuvi_svn_free_lock_list(NuviLockList* list);
int nuvi_svn_break_lock(const char* path, const char* locked_path, char* error_buf, int error_buf_size);
NuviTxnList nuvi_svn_get_uncommitted_txns(const char* path);
void nuvi_svn_free_txn_list(NuviTxnList* list);
int nuvi_svn_abort_txn(const char* path, const char* txn_name, char* error_buf, int error_buf_size);
int nuvi_svn_pack_repository(const char* path, char* error_buf, int error_buf_size);
int nuvi_svn_verify_repository(const char* path, int64_t start_rev, int64_t end_rev, char* error_buf, int error_buf_size);

// --- Phase 3: Web Repository Browser & File Operations ---

typedef struct {
    char name[256];
    char path[512];
    int is_dir;
    int64_t size_bytes;
    int64_t last_changed_rev;
    char last_author[128];
    char last_date[64];
    char last_log[512];
} NuviDirEntry;

typedef struct {
    int success;
    char error_message[512];
    int64_t revision;
    int count;
    NuviDirEntry* entries;
} NuviDirList;

typedef struct {
    int success;
    char error_message[512];
    int64_t size_bytes;
    char* content;
} NuviFileContent;

NuviDirList nuvi_svn_list_dir(const char* path, const char* dir_path, int64_t revision);
void nuvi_svn_free_dir_list(NuviDirList* list);

NuviFileContent nuvi_svn_cat_file(const char* path, const char* file_path, int64_t revision);
void nuvi_svn_free_file_content(NuviFileContent* content);

int nuvi_svn_put_file(const char* path, const char* file_path, const char* content, int64_t content_size, const char* author, const char* log_message, char* error_buf, int error_buf_size);

#ifdef __cplusplus
}
#endif

#endif // NUVI_SVN_WRAPPER_HPP

