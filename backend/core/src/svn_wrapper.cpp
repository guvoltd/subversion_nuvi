/**
 * Subversion Nuvi - Native C++ Subversion Core Wrapper Implementation
 */

#include "svn_wrapper.hpp"

#include <apr_general.h>
#include <apr_pools.h>
#include <apr_hash.h>
#include <apr_strings.h>
#include <apr_time.h>

#include <svn_types.h>
#include <svn_error.h>
#include <svn_pools.h>
#include <svn_hash.h>
#include <svn_utf.h>
#include <svn_dso.h>
#include <svn_path.h>
#include <svn_dirent_uri.h>
#include <svn_repos.h>
#include <svn_fs.h>
#include <svn_props.h>

#include <string>
#include <cstring>
#include <vector>
#include <iostream>

static bool s_initialized = false;
static apr_pool_t* s_global_pool = nullptr;

static void set_error(char* err_buf, int err_size, svn_error_t* err) {
    if (!err_buf || err_size <= 0) return;
    if (!err) {
        err_buf[0] = '\0';
        return;
    }
    char buf[512];
    svn_err_best_message(err, buf, sizeof(buf));
    snprintf(err_buf, err_size, "%s (apr_err=%d)", buf, err->apr_err);
}

int nuvi_svn_init(void) {
    if (s_initialized) return 0;

    apr_status_t status = apr_initialize();
    if (status != APR_SUCCESS) {
        return -1;
    }

    if (apr_pool_create(&s_global_pool, nullptr) != APR_SUCCESS) {
        return -2;
    }

    svn_dso_initialize2();
    svn_utf_initialize2(FALSE, s_global_pool);

    s_initialized = true;
    return 0;
}

int nuvi_svn_create_repository(const char* path, const char* fstype, const char* compatible_version, char* error_buf, int error_buf_size) {
    nuvi_svn_init();

    apr_pool_t* subpool = svn_pool_create(s_global_pool);
    apr_hash_t* fs_config = apr_hash_make(subpool);

    const char* fs_type_val = (fstype && strlen(fstype) > 0) ? fstype : SVN_FS_TYPE_FSFS;
    svn_hash_sets(fs_config, SVN_FS_CONFIG_FS_TYPE, fs_type_val);

    if (compatible_version && strlen(compatible_version) > 0) {
        svn_hash_sets(fs_config, SVN_FS_CONFIG_COMPATIBLE_VERSION, compatible_version);
    }

    const char* internal_path = svn_dirent_internal_style(path, subpool);
    svn_repos_t* repos = nullptr;

    svn_error_t* err = svn_repos_create(&repos, internal_path, nullptr, nullptr, nullptr, fs_config, subpool);
    if (err) {
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return -1;
    }

    if (error_buf && error_buf_size > 0) error_buf[0] = '\0';
    svn_pool_destroy(subpool);
    return 0;
}

NuviRepoInfo nuvi_svn_get_repo_info(const char* path) {
    NuviRepoInfo info;
    memset(&info, 0, sizeof(info));
    nuvi_svn_init();

    apr_pool_t* subpool = svn_pool_create(s_global_pool);
    const char* internal_path = svn_dirent_internal_style(path, subpool);

    svn_repos_t* repos = nullptr;
    svn_error_t* err = svn_repos_open3(&repos, internal_path, nullptr, subpool, subpool);
    if (err) {
        info.success = 0;
        set_error(info.error_message, sizeof(info.error_message), err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return info;
    }

    svn_fs_t* fs = svn_repos_fs(repos);
    const char* uuid = nullptr;
    err = svn_fs_get_uuid(fs, &uuid, subpool);
    if (!err && uuid) {
        strncpy(info.uuid, uuid, sizeof(info.uuid) - 1);
    } else if (err) {
        svn_error_clear(err);
    }

    // FS Type
    const char* fs_type = svn_repos_fs_type(repos, subpool);
    if (fs_type) {
        strncpy(info.fs_type, fs_type, sizeof(info.fs_type) - 1);
    } else {
        strncpy(info.fs_type, "fsfs", sizeof(info.fs_type) - 1);
    }

    // Latest revision
    svn_revnum_t youngest_rev = 0;
    err = svn_fs_youngest_rev(&youngest_rev, fs, subpool);
    if (!err) {
        info.latest_revision = youngest_rev;
    } else {
        svn_error_clear(err);
    }

    // Extract revision properties for HEAD (author, date, log)
    apr_hash_t* revprops = nullptr;
    err = svn_fs_revision_proplist2(&revprops, fs, youngest_rev, TRUE, subpool, subpool);
    if (!err && revprops) {
        svn_string_t* author = (svn_string_t*)svn_hash_gets(revprops, SVN_PROP_REVISION_AUTHOR);
        if (author && author->data) {
            strncpy(info.latest_author, author->data, sizeof(info.latest_author) - 1);
        }

        svn_string_t* date = (svn_string_t*)svn_hash_gets(revprops, SVN_PROP_REVISION_DATE);
        if (date && date->data) {
            strncpy(info.latest_date, date->data, sizeof(info.latest_date) - 1);
        }

        svn_string_t* log = (svn_string_t*)svn_hash_gets(revprops, SVN_PROP_REVISION_LOG);
        if (log && log->data) {
            strncpy(info.latest_log, log->data, sizeof(info.latest_log) - 1);
        }
    } else if (err) {
        svn_error_clear(err);
    }

    info.format_version = 9;
    info.success = 1;
    svn_pool_destroy(subpool);
    return info;
}

int nuvi_svn_init_standard_layout(const char* path, const char* author, const char* log_message, char* error_buf, int error_buf_size) {
    nuvi_svn_init();

    apr_pool_t* subpool = svn_pool_create(s_global_pool);
    const char* internal_path = svn_dirent_internal_style(path, subpool);

    svn_repos_t* repos = nullptr;
    svn_error_t* err = svn_repos_open3(&repos, internal_path, nullptr, subpool, subpool);
    if (err) {
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return -1;
    }

    svn_fs_t* fs = svn_repos_fs(repos);
    svn_revnum_t base_rev = 0;
    err = svn_fs_youngest_rev(&base_rev, fs, subpool);
    if (err) {
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return -2;
    }

    // Set commit log message and author in revprop_table
    const char* msg_val = (log_message && strlen(log_message) > 0) ? log_message : "Initialize standard project structure (trunk, branches, tags)";
    const char* author_val = (author && strlen(author) > 0) ? author : "nuvi-admin";

    apr_hash_t* revprop_table = apr_hash_make(subpool);
    svn_string_t* log_str = svn_string_create(msg_val, subpool);
    svn_string_t* author_str = svn_string_create(author_val, subpool);
    svn_hash_sets(revprop_table, SVN_PROP_REVISION_LOG, log_str);
    svn_hash_sets(revprop_table, SVN_PROP_REVISION_AUTHOR, author_str);

    svn_fs_txn_t* txn = nullptr;
    err = svn_repos_fs_begin_txn_for_commit2(&txn, repos, base_rev, revprop_table, subpool);
    if (err) {
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return -3;
    }

    svn_fs_root_t* txn_root = nullptr;
    err = svn_fs_txn_root(&txn_root, txn, subpool);
    if (err) {
        svn_fs_abort_txn(txn, subpool);
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return -4;
    }

    // Create /trunk, /branches, /tags
    const char* dirs[] = {"trunk", "branches", "tags"};
    for (int i = 0; i < 3; ++i) {
        svn_node_kind_t kind;
        err = svn_fs_check_path(&kind, txn_root, dirs[i], subpool);
        if (!err && kind == svn_node_none) {
            err = svn_fs_make_dir(txn_root, dirs[i], subpool);
            if (err) {
                svn_fs_abort_txn(txn, subpool);
                set_error(error_buf, error_buf_size, err);
                svn_error_clear(err);
                svn_pool_destroy(subpool);
                return -5;
            }
        }
    }

    // Commit transaction
    const char* conflict = nullptr;
    svn_revnum_t new_rev = SVN_INVALID_REVNUM;
    err = svn_repos_fs_commit_txn(&conflict, repos, &new_rev, txn, subpool);
    if (err) {
        svn_fs_abort_txn(txn, subpool);
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return -6;
    }

    if (error_buf && error_buf_size > 0) error_buf[0] = '\0';
    svn_pool_destroy(subpool);
    return 0;
}

NuviLockList nuvi_svn_get_active_locks(const char* path) {
    NuviLockList list;
    memset(&list, 0, sizeof(list));
    nuvi_svn_init();

    apr_pool_t* subpool = svn_pool_create(s_global_pool);
    const char* internal_path = svn_dirent_internal_style(path, subpool);

    svn_repos_t* repos = nullptr;
    svn_error_t* err = svn_repos_open3(&repos, internal_path, nullptr, subpool, subpool);
    if (err) {
        list.success = 0;
        set_error(list.error_message, sizeof(list.error_message), err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return list;
    }

    apr_hash_t* locks = nullptr;
    err = svn_repos_fs_get_locks2(&locks, repos, "/", svn_depth_infinity, nullptr, nullptr, subpool);
    if (err) {
        list.success = 0;
        set_error(list.error_message, sizeof(list.error_message), err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return list;
    }

    std::vector<NuviLockEntry> entries;
    if (locks) {
        for (apr_hash_index_t* hi = apr_hash_first(subpool, locks); hi; hi = apr_hash_next(hi)) {
            const void* key;
            void* val;
            apr_hash_this(hi, &key, nullptr, &val);
            svn_lock_t* lock = (svn_lock_t*)val;

            NuviLockEntry entry;
            memset(&entry, 0, sizeof(entry));
            if (lock->path) strncpy(entry.path, lock->path, sizeof(entry.path) - 1);
            if (lock->token) strncpy(entry.token, lock->token, sizeof(entry.token) - 1);
            if (lock->owner) strncpy(entry.owner, lock->owner, sizeof(entry.owner) - 1);
            if (lock->comment) strncpy(entry.comment, lock->comment, sizeof(entry.comment) - 1);

            char date_buf[64];
            apr_time_exp_t exp;
            apr_time_exp_gmt(&exp, lock->creation_date);
            apr_strftime(date_buf, nullptr, sizeof(date_buf), "%Y-%m-%dT%H:%M:%SZ", &exp);
            strncpy(entry.creation_date, date_buf, sizeof(entry.creation_date) - 1);

            if (lock->expiration_date != 0) {
                apr_time_exp_gmt(&exp, lock->expiration_date);
                apr_strftime(date_buf, nullptr, sizeof(date_buf), "%Y-%m-%dT%H:%M:%SZ", &exp);
                strncpy(entry.expiration_date, date_buf, sizeof(entry.expiration_date) - 1);
            }

            entries.push_back(entry);
        }
    }

    list.count = entries.size();
    if (list.count > 0) {
        list.entries = (NuviLockEntry*)malloc(sizeof(NuviLockEntry) * list.count);
        memcpy(list.entries, entries.data(), sizeof(NuviLockEntry) * list.count);
    } else {
        list.entries = nullptr;
    }

    list.success = 1;
    svn_pool_destroy(subpool);
    return list;
}

void nuvi_svn_free_lock_list(NuviLockList* list) {
    if (list && list->entries) {
        free(list->entries);
        list->entries = nullptr;
        list->count = 0;
    }
}

int nuvi_svn_break_lock(const char* path, const char* locked_path, char* error_buf, int error_buf_size) {
    nuvi_svn_init();

    apr_pool_t* subpool = svn_pool_create(s_global_pool);
    const char* internal_path = svn_dirent_internal_style(path, subpool);

    svn_repos_t* repos = nullptr;
    svn_error_t* err = svn_repos_open3(&repos, internal_path, nullptr, subpool, subpool);
    if (err) {
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return -1;
    }

    err = svn_repos_fs_unlock(repos, locked_path, nullptr, TRUE, subpool);
    if (err) {
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return -2;
    }

    if (error_buf && error_buf_size > 0) error_buf[0] = '\0';
    svn_pool_destroy(subpool);
    return 0;
}

NuviTxnList nuvi_svn_get_uncommitted_txns(const char* path) {
    NuviTxnList list;
    memset(&list, 0, sizeof(list));
    nuvi_svn_init();

    apr_pool_t* subpool = svn_pool_create(s_global_pool);
    const char* internal_path = svn_dirent_internal_style(path, subpool);

    svn_repos_t* repos = nullptr;
    svn_error_t* err = svn_repos_open3(&repos, internal_path, nullptr, subpool, subpool);
    if (err) {
        list.success = 0;
        set_error(list.error_message, sizeof(list.error_message), err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return list;
    }

    svn_fs_t* fs = svn_repos_fs(repos);
    apr_array_header_t* txns = nullptr;
    err = svn_fs_list_transactions(&txns, fs, subpool);
    if (err) {
        list.success = 0;
        set_error(list.error_message, sizeof(list.error_message), err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return list;
    }

    std::vector<NuviTxnEntry> entries;
    if (txns) {
        for (int i = 0; i < txns->nelts; ++i) {
            const char* txn_name = APR_ARRAY_IDX(txns, i, const char*);
            NuviTxnEntry entry;
            memset(&entry, 0, sizeof(entry));
            strncpy(entry.txn_name, txn_name, sizeof(entry.txn_name) - 1);

            svn_fs_txn_t* txn = nullptr;
            svn_error_t* txn_err = svn_fs_open_txn(&txn, fs, txn_name, subpool);
            if (!txn_err && txn) {
                entry.base_revision = svn_fs_txn_base_revision(txn);

                svn_string_t* date = nullptr;
                svn_fs_txn_prop(&date, txn, SVN_PROP_REVISION_DATE, subpool);
                if (date && date->data) {
                    strncpy(entry.creation_date, date->data, sizeof(entry.creation_date) - 1);
                }
            } else if (txn_err) {
                svn_error_clear(txn_err);
            }
            entries.push_back(entry);
        }
    }

    list.count = entries.size();
    if (list.count > 0) {
        list.entries = (NuviTxnEntry*)malloc(sizeof(NuviTxnEntry) * list.count);
        memcpy(list.entries, entries.data(), sizeof(NuviTxnEntry) * list.count);
    } else {
        list.entries = nullptr;
    }

    list.success = 1;
    svn_pool_destroy(subpool);
    return list;
}

void nuvi_svn_free_txn_list(NuviTxnList* list) {
    if (list && list->entries) {
        free(list->entries);
        list->entries = nullptr;
        list->count = 0;
    }
}

int nuvi_svn_abort_txn(const char* path, const char* txn_name, char* error_buf, int error_buf_size) {
    nuvi_svn_init();

    apr_pool_t* subpool = svn_pool_create(s_global_pool);
    const char* internal_path = svn_dirent_internal_style(path, subpool);

    svn_repos_t* repos = nullptr;
    svn_error_t* err = svn_repos_open3(&repos, internal_path, nullptr, subpool, subpool);
    if (err) {
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return -1;
    }

    svn_fs_t* fs = svn_repos_fs(repos);
    svn_fs_txn_t* txn = nullptr;
    err = svn_fs_open_txn(&txn, fs, txn_name, subpool);
    if (err) {
        svn_error_clear(err);
        err = svn_fs_purge_txn(fs, txn_name, subpool);
    } else {
        err = svn_fs_abort_txn(txn, subpool);
    }

    if (err) {
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return -2;
    }

    if (error_buf && error_buf_size > 0) error_buf[0] = '\0';
    svn_pool_destroy(subpool);
    return 0;
}

int nuvi_svn_pack_repository(const char* path, char* error_buf, int error_buf_size) {
    nuvi_svn_init();

    apr_pool_t* subpool = svn_pool_create(s_global_pool);
    const char* internal_path = svn_dirent_internal_style(path, subpool);

    svn_repos_t* repos = nullptr;
    svn_error_t* err = svn_repos_open3(&repos, internal_path, nullptr, subpool, subpool);
    if (err) {
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return -1;
    }

    err = svn_repos_fs_pack2(repos, nullptr, nullptr, nullptr, nullptr, subpool);
    if (err) {
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return -2;
    }

    if (error_buf && error_buf_size > 0) error_buf[0] = '\0';
    svn_pool_destroy(subpool);
    return 0;
}

int nuvi_svn_verify_repository(const char* path, int64_t start_rev, int64_t end_rev, char* error_buf, int error_buf_size) {
    nuvi_svn_init();

    apr_pool_t* subpool = svn_pool_create(s_global_pool);
    const char* internal_path = svn_dirent_internal_style(path, subpool);

    svn_repos_t* repos = nullptr;
    svn_error_t* err = svn_repos_open3(&repos, internal_path, nullptr, subpool, subpool);
    if (err) {
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return -1;
    }

    svn_revnum_t s_rev = (start_rev < 0) ? SVN_INVALID_REVNUM : (svn_revnum_t)start_rev;
    svn_revnum_t e_rev = (end_rev < 0) ? SVN_INVALID_REVNUM : (svn_revnum_t)end_rev;

    err = svn_repos_verify_fs3(repos, s_rev, e_rev, FALSE, FALSE, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, subpool);
    if (err) {
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return -2;
    }

    if (error_buf && error_buf_size > 0) error_buf[0] = '\0';
    svn_pool_destroy(subpool);
    return 0;
}

// --- Phase 3: Web Repository Browser & File Operations ---

NuviDirList nuvi_svn_list_dir(const char* path, const char* dir_path, int64_t revision) {
    nuvi_svn_init();

    NuviDirList list;
    memset(&list, 0, sizeof(list));

    apr_pool_t* subpool = svn_pool_create(s_global_pool);
    const char* internal_path = svn_dirent_internal_style(path, subpool);

    svn_repos_t* repos = nullptr;
    svn_error_t* err = svn_repos_open3(&repos, internal_path, nullptr, subpool, subpool);
    if (err) {
        set_error(list.error_message, sizeof(list.error_message), err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return list;
    }

    svn_fs_t* fs = svn_repos_fs(repos);
    svn_revnum_t rev = (svn_revnum_t)revision;
    if (rev < 0) {
        err = svn_fs_youngest_rev(&rev, fs, subpool);
        if (err) {
            set_error(list.error_message, sizeof(list.error_message), err);
            svn_error_clear(err);
            svn_pool_destroy(subpool);
            return list;
        }
    }
    list.revision = rev;

    svn_fs_root_t* root = nullptr;
    err = svn_fs_revision_root(&root, fs, rev, subpool);
    if (err) {
        set_error(list.error_message, sizeof(list.error_message), err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return list;
    }

    const char* norm_dir = dir_path;
    if (!norm_dir || strlen(norm_dir) == 0 || (strlen(norm_dir) == 1 && norm_dir[0] == '/')) {
        norm_dir = "";
    } else if (norm_dir[0] == '/') {
        norm_dir++;
    }

    apr_hash_t* dirents = nullptr;
    err = svn_fs_dir_entries(&dirents, root, norm_dir, subpool);
    if (err) {
        set_error(list.error_message, sizeof(list.error_message), err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return list;
    }

    int count = apr_hash_count(dirents);
    list.count = count;
    if (count > 0) {
        list.entries = (NuviDirEntry*)calloc(count, sizeof(NuviDirEntry));
        int idx = 0;
        for (apr_hash_index_t* hi = apr_hash_first(subpool, dirents); hi; hi = apr_hash_next(hi)) {
            const void* key;
            void* val;
            apr_hash_this(hi, &key, nullptr, &val);
            const char* entry_name = (const char*)key;
            svn_fs_dirent_t* dirent = (svn_fs_dirent_t*)val;

            NuviDirEntry* e = &list.entries[idx++];
            strncpy(e->name, entry_name, sizeof(e->name) - 1);
            e->is_dir = (dirent->kind == svn_node_dir) ? 1 : 0;

            const char* full_entry_path = svn_relpath_join(norm_dir, entry_name, subpool);
            snprintf(e->path, sizeof(e->path), "/%s", full_entry_path);

            if (e->is_dir == 0) {
                svn_filesize_t flen = 0;
                svn_error_t* len_err = svn_fs_file_length(&flen, root, full_entry_path, subpool);
                if (!len_err) {
                    e->size_bytes = (int64_t)flen;
                } else {
                    svn_error_clear(len_err);
                }
            }

            // Get last modified info
            svn_revnum_t created_rev = 0;
            svn_error_t* rev_err = svn_fs_node_created_rev(&created_rev, root, full_entry_path, subpool);
            if (!rev_err) {
                e->last_changed_rev = created_rev;

                apr_hash_t* revprops = nullptr;
                svn_error_t* prop_err = svn_fs_revision_proplist2(&revprops, fs, created_rev, TRUE, subpool, subpool);
                if (!prop_err && revprops) {
                    svn_string_t* author = (svn_string_t*)svn_hash_gets(revprops, SVN_PROP_REVISION_AUTHOR);
                    if (author && author->data) {
                        strncpy(e->last_author, author->data, sizeof(e->last_author) - 1);
                    }
                    svn_string_t* date = (svn_string_t*)svn_hash_gets(revprops, SVN_PROP_REVISION_DATE);
                    if (date && date->data) {
                        strncpy(e->last_date, date->data, sizeof(e->last_date) - 1);
                    }
                    svn_string_t* log = (svn_string_t*)svn_hash_gets(revprops, SVN_PROP_REVISION_LOG);
                    if (log && log->data) {
                        strncpy(e->last_log, log->data, sizeof(e->last_log) - 1);
                    }
                } else if (prop_err) {
                    svn_error_clear(prop_err);
                }
            } else {
                svn_error_clear(rev_err);
            }
        }
    }

    list.success = 1;
    svn_pool_destroy(subpool);
    return list;
}

void nuvi_svn_free_dir_list(NuviDirList* list) {
    if (list && list->entries) {
        free(list->entries);
        list->entries = nullptr;
        list->count = 0;
    }
}

NuviFileContent nuvi_svn_cat_file(const char* path, const char* file_path, int64_t revision) {
    nuvi_svn_init();

    NuviFileContent content;
    memset(&content, 0, sizeof(content));

    apr_pool_t* subpool = svn_pool_create(s_global_pool);
    const char* internal_path = svn_dirent_internal_style(path, subpool);

    svn_repos_t* repos = nullptr;
    svn_error_t* err = svn_repos_open3(&repos, internal_path, nullptr, subpool, subpool);
    if (err) {
        set_error(content.error_message, sizeof(content.error_message), err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return content;
    }

    svn_fs_t* fs = svn_repos_fs(repos);
    svn_revnum_t rev = (svn_revnum_t)revision;
    if (rev < 0) {
        err = svn_fs_youngest_rev(&rev, fs, subpool);
        if (err) {
            set_error(content.error_message, sizeof(content.error_message), err);
            svn_error_clear(err);
            svn_pool_destroy(subpool);
            return content;
        }
    }

    svn_fs_root_t* root = nullptr;
    err = svn_fs_revision_root(&root, fs, rev, subpool);
    if (err) {
        set_error(content.error_message, sizeof(content.error_message), err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return content;
    }

    const char* norm_file = file_path;
    if (norm_file && norm_file[0] == '/') norm_file++;

    svn_filesize_t flen = 0;
    err = svn_fs_file_length(&flen, root, norm_file, subpool);
    if (err) {
        set_error(content.error_message, sizeof(content.error_message), err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return content;
    }

    svn_stream_t* stream = nullptr;
    err = svn_fs_file_contents(&stream, root, norm_file, subpool);
    if (err) {
        set_error(content.error_message, sizeof(content.error_message), err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return content;
    }

    content.size_bytes = (int64_t)flen;
    content.content = (char*)malloc(flen + 1);
    if (!content.content) {
        snprintf(content.error_message, sizeof(content.error_message), "Out of memory allocating %ld bytes", (long)flen);
        svn_pool_destroy(subpool);
        return content;
    }

    apr_size_t read_len = flen;
    err = svn_stream_read_full(stream, content.content, &read_len);
    if (err) {
        set_error(content.error_message, sizeof(content.error_message), err);
        svn_error_clear(err);
        free(content.content);
        content.content = nullptr;
        svn_pool_destroy(subpool);
        return content;
    }

    content.content[read_len] = '\0';
    content.success = 1;
    svn_pool_destroy(subpool);
    return content;
}

void nuvi_svn_free_file_content(NuviFileContent* content) {
    if (content && content->content) {
        free(content->content);
        content->content = nullptr;
        content->size_bytes = 0;
    }
}

int nuvi_svn_put_file(const char* path, const char* file_path, const char* content, int64_t content_size, const char* author, const char* log_message, char* error_buf, int error_buf_size) {
    nuvi_svn_init();

    apr_pool_t* subpool = svn_pool_create(s_global_pool);
    const char* internal_path = svn_dirent_internal_style(path, subpool);

    svn_repos_t* repos = nullptr;
    svn_error_t* err = svn_repos_open3(&repos, internal_path, nullptr, subpool, subpool);
    if (err) {
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return -1;
    }

    svn_fs_t* fs = svn_repos_fs(repos);
    svn_revnum_t base_rev = 0;
    err = svn_fs_youngest_rev(&base_rev, fs, subpool);
    if (err) {
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return -2;
    }

    apr_hash_t* revprop_table = apr_hash_make(subpool);
    svn_string_t* author_str = svn_string_create(author ? author : "nuvi-web", subpool);
    svn_string_t* log_str = svn_string_create(log_message ? log_message : "Web file upload", subpool);
    svn_hash_sets(revprop_table, SVN_PROP_REVISION_AUTHOR, author_str);
    svn_hash_sets(revprop_table, SVN_PROP_REVISION_LOG, log_str);

    svn_fs_txn_t* txn = nullptr;
    err = svn_repos_fs_begin_txn_for_commit2(&txn, repos, base_rev, revprop_table, subpool);
    if (err) {
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return -3;
    }

    svn_fs_root_t* txn_root = nullptr;
    err = svn_fs_txn_root(&txn_root, txn, subpool);
    if (err) {
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_fs_abort_txn(txn, subpool);
        svn_pool_destroy(subpool);
        return -4;
    }

    const char* norm_file = file_path;
    if (norm_file && norm_file[0] == '/') norm_file++;

    svn_node_kind_t kind;
    err = svn_fs_check_path(&kind, txn_root, norm_file, subpool);
    if (!err && kind == svn_node_none) {
        err = svn_fs_make_file(txn_root, norm_file, subpool);
    }
    if (err) {
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_fs_abort_txn(txn, subpool);
        svn_pool_destroy(subpool);
        return -5;
    }

    svn_stream_t* stream = nullptr;
    err = svn_fs_apply_text(&stream, txn_root, norm_file, nullptr, subpool);
    if (err) {
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_fs_abort_txn(txn, subpool);
        svn_pool_destroy(subpool);
        return -6;
    }

    apr_size_t write_len = (apr_size_t)content_size;
    err = svn_stream_write(stream, content, &write_len);
    svn_error_t* close_err = svn_stream_close(stream);
    if (err || close_err) {
        if (!err) err = close_err;
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_fs_abort_txn(txn, subpool);
        svn_pool_destroy(subpool);
        return -7;
    }

    const char* conflict_p = nullptr;
    svn_revnum_t committed_rev = 0;
    err = svn_repos_fs_commit_txn(&conflict_p, repos, &committed_rev, txn, subpool);
    if (err) {
        set_error(error_buf, error_buf_size, err);
        svn_error_clear(err);
        svn_pool_destroy(subpool);
        return -8;
    }

    if (error_buf && error_buf_size > 0) error_buf[0] = '\0';
    svn_pool_destroy(subpool);
    return (int)committed_rev;
}

