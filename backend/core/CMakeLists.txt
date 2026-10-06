cmake_minimum_required(VERSION 3.16)
project(nuvi_svn_core C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

find_package(PkgConfig)

include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    /usr/include/subversion-1
    /usr/include/apr-1.0
    /usr/include/apr-1
)

# Shared library
add_library(nuvi_svn_core SHARED
    src/svn_wrapper.cpp
)

target_link_libraries(nuvi_svn_core PRIVATE
    svn_repos-1
    svn_fs-1
    svn_subr-1
    apr-1
    aprutil-1
)

set_target_properties(nuvi_svn_core PROPERTIES
    OUTPUT_NAME "nuvi_svn_core"
    PREFIX "lib"
    LIBRARY_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/build"
)
