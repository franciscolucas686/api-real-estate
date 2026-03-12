import { SetMetadata } from '@nestjs/common';

export const CACHE_TTL_KEY = 'cache:ttl';
export const CACHE_KEY_META = 'cache:key';
export const INVALIDATE_CACHE_KEY = 'cache:invalidate';

export const CacheTTL = (ttl: number) => SetMetadata(CACHE_TTL_KEY, ttl);
export const CacheKey = (key: string) => SetMetadata(CACHE_KEY_META, key);
export const InvalidateCache = (...patterns: string[]) =>
  SetMetadata(INVALIDATE_CACHE_KEY, patterns);
