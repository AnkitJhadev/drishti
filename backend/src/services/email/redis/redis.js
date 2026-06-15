import Redis from "ioredis"

const client = new Redis("rediss://default:gQAAAAAAAjQMAAIgcDFkZTgzNTczNDJkMmY0MTgyYmU1M2RmYTE2MWZiMTk2OA@steady-spaniel-144396.upstash.io:6379");
await client.set('foo', 'bar');