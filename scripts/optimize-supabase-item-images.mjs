import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) env var.');
  process.exit(1);
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY env var.');
  process.exit(1);
}

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getArgValue = (name, fallback) => {
  const prefix = `${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
};

const apply = hasFlag('--apply');
const bucket = getArgValue('--bucket', 'item-images');
const prefix = getArgValue('--prefix', '');
const quality = Number(getArgValue('--quality', '70'));
const maxWidth = Number(getArgValue('--max-width', '1600'));
const minBytes = Number(getArgValue('--min-bytes', String(900 * 1024)));
const minSavingsPercent = Number(getArgValue('--min-savings-percent', '10'));
const concurrency = Math.max(1, Number(getArgValue('--concurrency', '4')));

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const normalizePrefix = (value) => value.replace(/^\/+|\/+$/g, '');
const cleanPrefix = normalizePrefix(prefix);

const joinPath = (...parts) => {
  const filtered = parts.filter(Boolean).map((part) => String(part).replace(/^\/+|\/+$/g, ''));
  return filtered.join('/');
};

const encodeStoragePath = (path) => path.split('/').map(encodeURIComponent).join('/');

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes;
  let idx = -1;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(2)} ${units[idx]}`;
};

const listFilesRecursive = async (folderPrefix) => {
  const files = [];
  const queue = [normalizePrefix(folderPrefix)];

  while (queue.length > 0) {
    const current = queue.shift() ?? '';
    let offset = 0;

    while (true) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(current || undefined, {
          limit: 100,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        });

      if (error) {
        throw new Error(`Failed to list "${current || '/'}": ${error.message}`);
      }

      if (!data || data.length === 0) {
        break;
      }

      for (const item of data) {
        const itemPath = joinPath(current, item.name);
        const size = Number(item.metadata?.size ?? 0);
        if (item.id && size > 0) {
          files.push({ path: itemPath, size });
        } else {
          queue.push(itemPath);
        }
      }

      if (data.length < 100) {
        break;
      }
      offset += data.length;
    }
  }

  return files;
};

const getOptimizedBuffer = async (path) => {
  const renderUrl = `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/render/image/public/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}?width=${maxWidth}&quality=${quality}`;

  const response = await fetch(renderUrl, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Transform request failed (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get('content-type') || 'application/octet-stream';

  return { buffer, contentType };
};

const files = await listFilesRecursive(cleanPrefix);

if (files.length === 0) {
  console.log('No files found for the selected bucket/prefix.');
  process.exit(0);
}

console.log(`Found ${files.length} file(s) in bucket "${bucket}"${cleanPrefix ? ` under "${cleanPrefix}"` : ''}.`);
console.log(`Mode: ${apply ? 'APPLY (will overwrite originals)' : 'DRY RUN (no writes)'}`);
console.log(`Rules: minBytes=${formatBytes(minBytes)}, quality=${quality}, maxWidth=${maxWidth}, minSavingsPercent=${minSavingsPercent}%`);

const candidates = files.filter((file) => file.size >= minBytes);
console.log(`Candidate files (>= minBytes): ${candidates.length}`);

if (candidates.length === 0) {
  process.exit(0);
}

let processed = 0;
let skipped = 0;
let failed = 0;
let wouldUpdate = 0;
let originalTotal = 0;
let optimizedTotal = 0;

const worker = async () => {
  while (true) {
    const index = processed;
    if (index >= candidates.length) return;
    processed += 1;

    const file = candidates[index];
    originalTotal += file.size;

    try {
      const { buffer, contentType } = await getOptimizedBuffer(file.path);
      const optimizedSize = buffer.byteLength;
      const savings = file.size - optimizedSize;
      const savingsPercent = (savings / file.size) * 100;

      if (savings <= 0 || savingsPercent < minSavingsPercent) {
        skipped += 1;
        console.log(`SKIP ${file.path} (${formatBytes(file.size)} -> ${formatBytes(optimizedSize)}, ${savingsPercent.toFixed(1)}%)`);
        continue;
      }

      optimizedTotal += optimizedSize;
      wouldUpdate += 1;

      if (apply) {
        const { error } = await supabase.storage
          .from(bucket)
          .upload(file.path, buffer, {
            upsert: true,
            contentType,
            cacheControl: '3600',
          });

        if (error) {
          throw new Error(error.message);
        }
      }

      const action = apply ? 'UPDATED' : 'WOULD_UPDATE';
      console.log(`${action} ${file.path} (${formatBytes(file.size)} -> ${formatBytes(optimizedSize)}, ${savingsPercent.toFixed(1)}%)`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()));

console.log('');
console.log('Done.');
console.log(`Candidates checked: ${candidates.length}`);
console.log(`Would update / updated: ${wouldUpdate}`);
console.log(`Skipped (low savings): ${skipped}`);
console.log(`Failed: ${failed}`);

if (wouldUpdate > 0) {
  const savingsBytes = originalTotal - optimizedTotal;
  const savingsPercent = (savingsBytes / originalTotal) * 100;
  console.log(`Estimated savings across updated files: ${formatBytes(savingsBytes)} (${savingsPercent.toFixed(1)}%)`);
}

if (!apply) {
  console.log('');
  console.log('Dry run complete. Re-run with --apply to overwrite originals.');
}
