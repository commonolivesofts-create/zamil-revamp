// Imported first by the entry points. In thick mode (see ORACLE_CLIENT_LIB_DIR) every database
// call holds one of libuv's worker threads, and there are only 4 by default, so one slow EBS
// report could stall every other request, ADW pages included. Give each pooled connection
// (ADW 8 + EBS 4) a thread, plus 4 for file and DNS work. libuv reads this on first use.
process.env.UV_THREADPOOL_SIZE ??= '16';
